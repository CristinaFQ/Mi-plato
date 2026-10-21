"""Local application server and read-only, strict food catalogue API."""
import argparse
import hashlib
import json
import sqlite3
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'data' / 'catalogo.json'
DATABASE = ROOT / 'data' / 'catalogo.sqlite3'
GROUPS = {
    'proteina': ('Proteínas', 'Carne, pescado, huevos, alternativas vegetales y leche semidesnatada'),
    'carbohidrato': ('Carbohidratos', 'Cereales, tubérculos y otros alimentos de este grupo'),
    'grasa': ('Grasas', 'Frutos secos, semillas y sus derivados autorizados'),
    'verdura': ('Verduras', 'Las verduras de tu lista'),
    'fruta': ('Frutas', 'Las 17 frutas autorizadas · Máximo dos raciones al día'),
    'lacteos': ('Lácteos', 'Yogur, queso cottage, leche desnatada y kéfir'),
    'otros': ('Otros vegetales', 'Bebidas, yogur vegetal y algas de tu lista'),
}


def food_group(food):
    if food.get('grupo_principal') in GROUPS:
        return food['grupo_principal']
    category = food['categoria']
    if category in ('carne', 'pescado_marisco', 'huevos', 'legumbres_derivados'):
        return 'proteina'
    if food['nombre'] in ('Proteína de guisante en polvo', 'Proteína de soja en polvo'):
        return 'proteina'
    if category == 'frutos_secos_semillas':
        return 'grasa'
    return category if category in GROUPS else 'otros'


def initialize_database(source=SOURCE, database=DATABASE):
    raw = Path(source).read_bytes()
    catalogue = json.loads(raw)
    digest = hashlib.sha256(raw).hexdigest()
    Path(database).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database) as connection:
        connection.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        connection.execute('CREATE TABLE IF NOT EXISTS foods (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, food_group TEXT NOT NULL, payload TEXT NOT NULL)')
        connection.execute('CREATE INDEX IF NOT EXISTS foods_group ON foods(food_group)')
        existing = connection.execute("SELECT value FROM metadata WHERE key='digest'").fetchone()
        if existing and existing[0] == digest:
            return
        connection.execute('DELETE FROM foods')
        # Only the authorized array is imported. Pending entries are never inserted.
        for food in catalogue['alimentos']:
            connection.execute('INSERT INTO foods VALUES (?, ?, ?, ?, ?)', (
                food['id'], food['nombre'], food['categoria'], food_group(food),
                json.dumps(food, ensure_ascii=False),
            ))
        for key, value in [('digest', digest), ('configuracion', json.dumps(catalogue['configuracion']))]:
            connection.execute('INSERT OR REPLACE INTO metadata VALUES (?, ?)', (key, value))


def normalize(value):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', value.casefold()) if not unicodedata.combining(c))


def decoded(row):
    food = json.loads(row[0])
    return {**food, 'grupo': food_group(food)}


def api_response(path, params, database=DATABASE):
    with sqlite3.connect(database) as connection:
        connection.create_function('normalize', 1, normalize)
        if path == '/api/catalogo':
            counts = dict(connection.execute('SELECT food_group, COUNT(*) FROM foods GROUP BY food_group'))
            configuration = json.loads(connection.execute("SELECT value FROM metadata WHERE key='configuracion'").fetchone()[0])
            return 200, {
                'total': sum(counts.values()), 'configuracion': configuration,
                'grupos': [{'id': key, 'nombre': name, 'descripcion': description, 'cantidad': counts.get(key, 0)} for key, (name, description) in GROUPS.items()],
            }
        if path != '/api/alimentos':
            return 404, {'error': 'Ruta no encontrada.'}
        ids = params.get('ids', [''])[0]
        if ids:
            identifiers = list(dict.fromkeys(ids.split(',')))[:1000]
            placeholders = ','.join('?' for _ in identifiers)
            rows = connection.execute(f'SELECT payload FROM foods WHERE id IN ({placeholders})', identifiers)
            return 200, {'alimentos': [decoded(row) for row in rows]}
        group = params.get('grupo', [''])[0]
        if not group:
            return 200, {'alimentos': [], 'total': 0, 'pagina': 1, 'paginas': 0}
        if group not in GROUPS:
            return 400, {'error': 'Grupo no válido.'}
        meal = params.get('comida', [''])[0]
        if meal == 'Cena' and group == 'carbohidrato':
            return 200, {'alimentos': [], 'total': 0, 'pagina': 1, 'paginas': 0}
        try:
            page = max(1, min(1000, int(params.get('pagina', ['1'])[0])))
        except ValueError:
            return 400, {'error': 'Página no válida.'}
        query = params.get('q', [''])[0].strip()[:100]
        where = 'food_group = ? AND instr(normalize(name), normalize(?)) > 0'
        values = (group, query)
        count = connection.execute('SELECT COUNT(*) FROM foods WHERE ' + where, values).fetchone()[0]
        pages = (count + 7) // 8
        page = min(page, max(1, pages))
        rows = connection.execute('SELECT payload FROM foods WHERE ' + where + ' ORDER BY normalize(name), id LIMIT 8 OFFSET ?', (*values, (page - 1) * 8))
        return 200, {'alimentos': [decoded(row) for row in rows], 'total': count, 'pagina': page, 'paginas': pages}


class AppHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        try:
            self.serve_get()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # A refresh, closed tab, or cancelled request can disconnect mid-response.
            self.close_connection = True

    def end_headers(self):
        # Local source files change without a build step. Serve current modules together.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def serve_get(self):
        url = urlsplit(self.path)
        if url.path.startswith('/api/'):
            try:
                status, payload = api_response(url.path, parse_qs(url.query))
            except sqlite3.Error:
                status, payload = 500, {'error': 'No se ha podido consultar el catálogo.'}
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Mi plato: servidor local con catálogo SQLite.')
    parser.add_argument('--port', type=int, default=5173)
    parser.add_argument('--legacy', action='store_true', help='Abrir expresamente la interfaz antigua de dist/.')
    args = parser.parse_args()
    web_directory = ROOT / ('dist' if args.legacy else 'build')
    if not (web_directory / 'index.html').is_file():
        parser.error('Falta la versión actual compilada. Ejecuta npm run build desde Plan2 y vuelve a iniciar el servidor.')
    initialize_database()
    handler = partial(AppHandler, directory=str(web_directory))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'Mi plato: http://localhost:{args.port}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import SOURCE, api_response, initialize_database


class CatalogueDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.database = Path(self.folder.name) / 'catalogue.sqlite3'
        initialize_database(database=self.database)

    def tearDown(self):
        self.folder.cleanup()

    def query(self, **params):
        return api_response('/api/alimentos', {k: [str(v)] for k, v in params.items()}, self.database)

    def test_import_is_exact_authorized_catalogue_and_idempotent(self):
        original = json.loads(SOURCE.read_text())['alimentos']
        initialize_database(database=self.database)
        with sqlite3.connect(self.database) as db:
            actual = [json.loads(row[0]) for row in db.execute('SELECT payload FROM foods ORDER BY id')]
        self.assertEqual(actual, original)
        self.assertEqual(len(actual), 145)
        status, data = api_response('/api/catalogo', {}, self.database)
        self.assertEqual(status, 200)
        self.assertEqual(data['total'], 145)
        self.assertEqual(sum(g['cantidad'] for g in data['grupos']), 145)
        self.assertNotIn('alimentos', data)

    def test_no_full_catalogue_without_group(self):
        status, data = self.query()
        self.assertEqual(status, 200)
        self.assertEqual(data['alimentos'], [])

    def test_pagination_never_returns_more_than_eight_and_covers_group(self):
        status, first = self.query(grupo='verdura')
        self.assertEqual(status, 200)
        self.assertEqual(first['total'], 45)
        ids = []
        for page in range(1, first['paginas'] + 1):
            _, data = self.query(grupo='verdura', pagina=page)
            self.assertLessEqual(len(data['alimentos']), 8)
            self.assertTrue(all(f['categoria'] == 'verdura' for f in data['alimentos']))
            ids.extend(f['id'] for f in data['alimentos'])
        self.assertEqual(len(ids), 45)
        self.assertEqual(len(set(ids)), 45)

    def test_dinner_excludes_carbohydrate_group_but_allows_lunch(self):
        self.assertEqual(self.query(grupo='carbohidrato', comida='Cena')[1]['alimentos'], [])
        self.assertEqual(self.query(grupo='carbohidrato', comida='Comida')[1]['total'], 22)

    def test_fat_group_only_contains_authorized_nuts_and_seeds(self):
        data = self.query(grupo='grasa')[1]
        self.assertEqual(data['total'], 10)
        self.assertTrue(all(f['categoria'] == 'frutos_secos_semillas' for f in data['alimentos']))

    def test_search_is_accent_insensitive_and_bound_to_group(self):
        data = self.query(grupo='verdura', q='brocoli')[1]
        self.assertEqual([f['nombre'] for f in data['alimentos']], ['Brócoli'])
        self.assertEqual(self.query(grupo='grasa', q='Aceite de oliva')[1]['total'], 0)
        self.assertEqual(self.query(grupo='verdura', q="' OR 1=1 --")[1]['total'], 0)

    def test_recovery_only_returns_authorized_requested_ids(self):
        data = self.query(ids='food_001,not_authorized,food_002')[1]
        self.assertEqual({f['id'] for f in data['alimentos']}, {'food_001', 'food_002'})
        self.assertTrue(all(f['grupo'] == 'fruta' for f in data['alimentos']))

    def test_authorized_milk_is_in_protein_group_with_ml_values(self):
        status, data = self.query(grupo='proteina', q='Leche semidesnatada')
        self.assertEqual(status, 200)
        self.assertEqual(data['total'], 1)
        milk = data['alimentos'][0]
        self.assertEqual(milk['grupo'], 'proteina')
        self.assertEqual(milk['categoria'], 'lacteos')
        self.assertEqual(milk['subcategoria'], 'Leche')
        self.assertEqual(milk['unidad_racion'], 'ml')
        self.assertEqual(milk['kcal_100ml'], 47)
        self.assertEqual(milk['azucares_100ml'], 4.8)
        self.assertEqual(milk['fibra_100ml'], 0)
        self.assertNotIn('kcal_100g', milk)

    def test_invalid_queries_are_rejected(self):
        self.assertEqual(self.query(grupo='inventado')[0], 400)
        self.assertEqual(self.query(grupo='verdura', pagina='bad')[0], 400)
        self.assertEqual(api_response('/api/missing', {}, self.database)[0], 404)


if __name__ == '__main__':
    unittest.main()

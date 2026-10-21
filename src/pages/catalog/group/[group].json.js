import { catalogue, groups } from '../../../lib/catalog.js';
export function getStaticPaths() { return groups.map(group => ({ params: { group: group.id }, props: { foods: catalogue.filter(f => f.grupo === group.id) } })); }
export function GET({ props }) { return new Response(JSON.stringify(props.foods), { headers: { 'Content-Type': 'application/json' } }); }

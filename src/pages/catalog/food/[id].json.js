import { catalogue } from '../../../lib/catalog.js';
export function getStaticPaths() { return catalogue.map(food => ({ params: { id: food.id }, props: { food } })); }
export function GET({ props }) { return new Response(JSON.stringify(props.food), { headers: { 'Content-Type': 'application/json' } }); }

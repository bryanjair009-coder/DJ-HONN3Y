/* Entrada del bundle de Realtime. Solo el cliente de canales — nada de
   postgrest-js/gotrue-js/storage-js, que trae supabase-js completo y que
   este sitio no usa (el REST ya lo hace fetch() a pelo en supabase-client.js).
   Regenerar con:  npm run realtime                                          */
import { RealtimeClient } from '@supabase/realtime-js';
export { RealtimeClient };

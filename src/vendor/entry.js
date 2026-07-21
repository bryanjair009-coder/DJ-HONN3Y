/* Entrada del bundle de Motion. Solo lo que se usa: animate del build mini
   (mucho más chico) + inView/stagger/spring del completo.
   Resultado: 13.7 KB en vez de los 139 KB del UMD entero.
   Regenerar con:  npm run motion                                            */
import { animate } from 'motion/mini';
import { inView, stagger, spring } from 'motion';
export { animate, inView, stagger, spring };

/**
 * Con perfiles, el avatar va a la izquierda de la barra solo en Inicio, Películas, Series y sus listas por categoría
 * (vod/:categoryId), como la web player 2.7.1; en una ficha (vod/:categoryId/:id), TV en vivo, Deportes o Explorar no.
 */
export const PROF_HERE = /\/xtreams\/[^/]+\/(home|(vod|series)(\/[^/?]+)?)(\?|$)/;

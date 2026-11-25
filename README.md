# Paises del mundo

Quiz para aprender los nombres de los 197 paises del mundo en espanol (193 de la ONU + Vaticano, Palestina, Kosovo y Taiwan).

## Modos

- **Reto**: escribe todos los paises que recuerdes antes de que acabe el tiempo (15 min el mundo entero, menos por continente). Se aceptan nombres sin tildes y alias habituales (Holanda, EEUU, Myanmar...). Al terminar ves en rojo los que faltaron.
- **Estudiar**: explora el mapa; al pasar el raton o tocar un pais ves su nombre. Lista por continente con buscador.
- **Practicar**: el mapa marca un pais y tienes que decir cual es (escribiendo o con 4 opciones). Usa repeticion espaciada: los que fallas salen mas a menudo. Tiene pistas y un modo "Ultimos fallos" con los paises que te faltaron en el ultimo reto.

El progreso se guarda en el navegador (localStorage).

## Uso

```sh
npm install
npm run dev     # servidor de desarrollo
npm test        # pruebas de datos y logica
npm run build   # version para publicar en dist/
```

Mapa: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth 1:50m) dibujado con d3-geo.

## Publicacion

Cada push a `main` se publica automaticamente en GitHub Pages:
https://juanexpensive.github.io/paises-del-mundo/

La lista de paises que aparece en la pagina (para buscadores) se genera al compilar desde `src/countries.js` (ver `vite.config.js`).

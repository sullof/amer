# Lettore EPUB

Server che apre i file `.epub` messi nella cartella `works`.

La home presenta il lettore. `/leggi/:slug` apre un EPUB. Se il file non c’è, la risposta è 404.

Lo slug è il nome del file senza `.epub` (solo lettere, numeri e trattini).

```
npm install
npm run dev
```

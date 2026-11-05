/** Tailwind STATIC build (speed fix) — pehle Tailwind Play CDN browser me
 * runtime par poori CSS generate karta tha jo har page load aur har screen
 * change ko slow karta tha. Ab CSS pehle se compile hokar static file me
 * aati hai (public/static/tailwind.css). Nayi utility class use karne par
 * `npm run build` dobara chalana hota hai (build:css usi me shamil hai). */
module.exports = {
  content: ['./src/index.tsx', './public/static/app.js'],
  theme: { extend: {} },
  plugins: [],
}

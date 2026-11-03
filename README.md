# Wayfarer: Translator, Currency Converter and Calculator

A lightweight web app with three tools in one place. No build step, no install.

**Live demo:** [https://wayfarerr-beryl.vercel.app/](https://wayfarerr-beryl.vercel.app/#translate)

## How to run
1. Unzip the folder.
2. Double-click `index.html` to open it in Chrome, Edge, Firefox or Safari.
   (An internet connection is needed for live translations and live exchange rates.)

Optional: serve it locally instead, e.g. `python3 -m http.server 8000`, then open http://localhost:8000.

## Features

**Translate**
- 50+ languages, including Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Punjabi, Kannada, Malayalam and Urdu
- Automatic language detection, swap languages, copy result
- Read aloud (uses your browser's built-in voices)
- Long text is split automatically; Ctrl + Enter to translate
- Recent translations saved on your device

**Currency**
- 160+ currencies with live rates (ExchangeRate-API, Frankfurter as backup)
- Rates cached for 6 hours; works offline with saved or built-in approximate rates
- Amount box accepts simple sums like `1500+250`
- Quick reference table and inverse rate

**Calculator**
- + − × ÷, percent, brackets, decimals; safe parser (no `eval`)
- `200 + 10%` gives 220, like a pocket calculator
- Full keyboard support (digits, operators, Enter, Backspace, Esc)
- Live result preview, history, copy result
- "Convert this amount" sends the result straight to the currency converter

## Files
- `index.html` page structure
- `style.css` styles (automatic light and dark mode)
- `calc-engine.js` calculator math engine
- `app.js` app logic

## Settings
At the top of `app.js`:
- `MYMEMORY_EMAIL`: add your email to raise the free translation limit from about 5,000 to 50,000 characters per day.
- `DEFAULT_FROM` / `DEFAULT_TO`: default currencies.
- `RATE_CACHE_HOURS`: how long exchange rates are reused before refreshing.

## Notes
- Translations come from the free MyMemory service, so quality is good for everyday phrases but not professional-grade.
- Exchange rates are mid-market reference rates; banks and card providers add their own margins.

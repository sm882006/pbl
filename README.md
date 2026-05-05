# Cryptocurrency Price Analysis and Prediction Website

This is a Flask-based web application that fetches historical cryptocurrency data from CoinGecko API, uses an LSTM machine learning model to predict prices, and displays results in a clean UI.

## Features
- Enter a cryptocurrency name (e.g., bitcoin) to get current price, predicted today's price, and 7-day forecast.
- Trend analysis (Upward/Downward).
- Responsive design with error handling.

## Tech Stack
- Backend: Python Flask
- Frontend: HTML, CSS, JavaScript (Bootstrap)
- ML: LSTM with TensorFlow/Keras
- API: CoinGecko (free)

## How to Run
1. Clone or download the project.
2. Install dependencies: `pip install -r requirements.txt`
3. Run the app: `python app.py`
4. Open http://127.0.0.1:5000/ in your browser.

## Project Structure
- `app.py`: Main Flask app with routes.
- `model/lstm_model.py`: LSTM training and prediction logic.
- `templates/index.html`: Home page template.
- `static/`: CSS and JS files.
- `data/`: Stores fetched data (CSV).
- `requirements.txt`: Dependencies.

## Notes
- Model training takes time; predictions are approximate.
- For production, optimize model caching and add authentication.
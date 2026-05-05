from dotenv import load_dotenv
load_dotenv()

import os
import requests
import numpy as np
import pandas as pd
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from model.lstm_model import train_and_predict

app = Flask(__name__)

# ---------------- GEMINI SETUP ----------------
# Default model worked with ListModels on this project; override with GEMINI_MODEL in .env if needed.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)
else:
    model = None


def resolve_coin_id(query):
    raw = (query or "").strip().lower()
    if not raw:
        return None

    try:
        probe = requests.get(f"https://api.coingecko.com/api/v3/coins/{raw}", timeout=10)
        if probe.ok:
            return raw
    except requests.exceptions.RequestException:
        pass

    try:
        search_resp = requests.get(
            "https://api.coingecko.com/api/v3/search",
            params={"query": raw},
            timeout=15,
        )
        search_resp.raise_for_status()
        coins = (search_resp.json() or {}).get("coins") or []
        if not coins:
            return None

        for coin in coins:
            if (coin.get("id") or "").lower() == raw:
                return coin.get("id")
        for coin in coins:
            if (coin.get("symbol") or "").lower() == raw:
                return coin.get("id")
        for coin in coins:
            if (coin.get("name") or "").lower() == raw:
                return coin.get("id")

        return coins[0].get("id")
    except requests.exceptions.RequestException:
        return None


# ---------------- HOME ----------------
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/information')
def information():
    return render_template('information.html')


# ---------------- COIN INFO ----------------
@app.route('/api/coin-info', methods=['GET'])
def coin_info():
    coin_query = request.args.get('id', '').strip()
    if not coin_query:
        return jsonify({'error': 'Please enter a coin id (e.g. bitcoin, ethereum).'}), 400

    try:
        coin_id = resolve_coin_id(coin_query)
        if not coin_id:
            return jsonify({'error': f'Coin "{coin_query}" not found.'}), 404

        url = (
            f"https://api.coingecko.com/api/v3/coins/{coin_id}"
            "?localization=false&tickers=false&market_data=true"
            "&community_data=true&developer_data=true&sparkline=false"
        )
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        data = resp.json()

        market = data.get('market_data') or {}
        community = data.get('community_data') or {}
        developer = data.get('developer_data') or {}

        return jsonify({
            'id': data.get('id'),
            'symbol': data.get('symbol'),
            'name': data.get('name'),
            'image': (data.get('image') or {}).get('large'),
            'description_html': (data.get('description') or {}).get('en'),
            'homepage': (data.get('links') or {}).get('homepage', [None])[0],
            'current_price_usd': market.get('current_price', {}).get('usd'),
            'market_cap_usd': market.get('market_cap', {}).get('usd'),
            'volume_24h_usd': market.get('total_volume', {}).get('usd'),
            'price_change_24h_pct': market.get('price_change_percentage_24h'),
            'price_change_7d_pct': market.get('price_change_percentage_7d_in_currency', {}).get('usd'),
            'price_change_30d_pct': market.get('price_change_percentage_30d_in_currency', {}).get('usd'),
            'circulating_supply': market.get('circulating_supply'),
            'total_supply': market.get('total_supply'),
            'max_supply': market.get('max_supply'),
            'market_cap_rank': data.get('market_cap_rank'),
            'community_score': community.get('community_score'),
            'developer_score': developer.get('developer_score'),
            'hashing_algorithm': data.get('hashing_algorithm'),
            'genesis_date': data.get('genesis_date'),
        })

    except requests.exceptions.RequestException:
        return jsonify({'error': f'Coin "{coin_query}" not found or API error.'}), 502


# ---------------- CHATBOT (GEMINI) ----------------
@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json(silent=True) or {}
    user_message = (data.get('message') or '').strip()

    if not user_message:
        return jsonify({'error': 'Please send a message.'}), 400

    if not GEMINI_API_KEY or not model:
        return jsonify({'error': 'Gemini API key missing. Check your .env file.'}), 500

    try:
        prompt = f"""
You are Dora, a helpful AI assistant for a crypto website.
Answer clearly and briefly.

User: {user_message}
"""

        response = model.generate_content(prompt)

        reply = response.text if response.text else "No response generated."

        return jsonify({'reply': reply})

    except Exception as e:
        print("Gemini API error:", str(e))
        return jsonify({
            'error': 'Gemini API request failed.',
            'details': str(e)
        }), 502


# ---------------- TOP 10 COINS ----------------
@app.route('/top10', methods=['GET'])
def top10():
    try:
        url = (
            "https://api.coingecko.com/api/v3/coins/markets"
            "?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false"
        )
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        items = response.json() or []

        simplified = []
        for it in items:
            simplified.append({
                "id": it.get("id"),
                "name": it.get("name"),
                "symbol": (it.get("symbol") or "").upper(),
                "current_price": it.get("current_price"),
                "market_cap": it.get("market_cap"),
                "total_volume": it.get("total_volume"),
                "price_change_percentage_24h": it.get("price_change_percentage_24h"),
                "image": it.get("image"),
            })

        return jsonify({"items": simplified})

    except requests.exceptions.RequestException:
        return jsonify({"error": "Failed to fetch top 10 coins."}), 502


# ---------------- PREDICTION ----------------
@app.route('/predict', methods=['POST'])
def predict():
    crypto_name = request.form.get('crypto_name')

    if not crypto_name:
        return jsonify({'error': 'Please enter a cryptocurrency name.'})

    crypto_name = crypto_name.lower().strip()

    try:
        coin_id = resolve_coin_id(crypto_name)
        if not coin_id:
            return jsonify({'error': f'Coin "{crypto_name}" not found.'}), 404

        market_url = (
            "https://api.coingecko.com/api/v3/coins/markets"
            "?vs_currency=usd"
            f"&ids={coin_id}"
            "&sparkline=false"
            "&price_change_percentage=7d"
        )
        market_resp = requests.get(market_url, timeout=20)
        market_resp.raise_for_status()
        market_items = market_resp.json() or []
        market_item = market_items[0] if market_items else {}

        url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart?vs_currency=usd&days=365"
        response = requests.get(url, timeout=25)
        response.raise_for_status()
        data = response.json()

        prices = data['prices']
        df = pd.DataFrame(prices, columns=['timestamp', 'price'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)

        os.makedirs('data', exist_ok=True)
        df.to_csv('data/crypto_data.csv')

        current_price = df['price'].iloc[-1]

        # Seven next daily closes in one shot (indices 0..6 = day +1 .. day +7)
        forecast = train_and_predict(df['price'].values, horizon=7)
        avg_path = float(np.mean(forecast))
        trend = "Upward" if avg_path > float(current_price) else "Downward"

        forecast_7d = [float(round(float(p), 2)) for p in forecast]

        return jsonify({
            'crypto_id': coin_id,
            'current_price': float(round(current_price, 2)),
            'forecast_7d': forecast_7d,
            'trend': trend,
            'market_cap': market_item.get('market_cap'),
            'volume_24h': market_item.get('total_volume'),
            'last_updated_ms': pd.to_datetime(
                market_item.get('last_updated')
            ).value // 10**6 if market_item.get('last_updated') else None,
            'history_dates': df.index.strftime('%Y-%m-%d').tolist(),
            'history_prices': [float(round(p, 6)) for p in df['price'].tolist()],
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ---------------- RUN ----------------
if __name__ == '__main__':
    os.makedirs('data', exist_ok=True)
    app.run(debug=True)

# 🏥 Medical Consultation Assistant

A Doctor Routing Assistant that recommends the right medical specialist based on user symptoms and location.

> ⚠️ For educational purposes only. Does not provide diagnoses or medical advice.

## Features
- NLP-based symptom extraction (Ollama / spaCy)
- Symptom → Specialization mapping via Infermedica API
- Geolocation via OpenStreetMap Nominatim
- Top 3 nearest doctor recommendations using Haversine Formula

## Setup
```bash
pip install -r requirements.txt
cp .env.example .env
# Fill in your API keys in .env
uvicorn app.main:app --reload
```

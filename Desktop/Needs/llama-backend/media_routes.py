from flask import Blueprint, request, jsonify
from ai_service import analyze_image_pixtral, transcribe_audio_voxtral
import logging

media_bp = Blueprint("media", __name__)

@media_bp.post("/analyzeImage")
def analyze_image():
    body = request.get_json(silent=True) or {}
    b64 = (body.get("base64") or "").strip()
    if not b64:
        return jsonify({"error": "base64 required"}), 400
    try:
        description = analyze_image_pixtral(b64)
        return jsonify({"description": description})
    except Exception as e:
        logging.error(f"[analyzeImage] {e}")
        return jsonify({"error": str(e)}), 500

@media_bp.post("/transcribeAudio")
def transcribe_audio():
    body = request.get_json(silent=True) or {}
    b64 = (body.get("base64") or "").strip()
    mime_type = body.get("mimeType", "audio/mpeg")
    if not b64:
        return jsonify({"error": "base64 required"}), 400
    try:
        transcript = transcribe_audio_voxtral(b64, mime_type)
        return jsonify({"transcript": transcript})
    except Exception as e:
        logging.error(f"[transcribeAudio] {e}")
        return jsonify({"error": str(e)}), 500

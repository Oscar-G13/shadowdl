import json
import os
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

INTENTS = ["Best for editing", "TikTok repost", "YouTube archive", "Mobile viewing", "Audio only", "Smallest file"]

async def recommend_format(metadata: dict, intent: str) -> dict:
    """Return {recommended_label, reason, tip} using GPT-4o-mini."""
    formats_text = "\n".join([
        f"- {f['label']}" + (f" (~{f['filesize']//1024//1024}MB)" if f.get('filesize') else "")
        for f in metadata.get("formats", [])
    ])

    prompt = f"""Video format recommendation task.

Video title: {metadata.get("title","Unknown")}
Platform: {metadata.get("platform","unknown")}
Duration: {metadata.get("duration","?")} seconds
Available quality options:
{formats_text}

User intent: "{intent}"

Respond with JSON only:
{{"recommended_label": "<exact label from list>", "reason": "<one sentence why>", "tip": "<one short practical tip>"}}"""

    resp = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=150,
    )
    return json.loads(resp.choices[0].message.content)


async def translate_srt(srt_content: str, target_language: str) -> str:
    """Translate SRT subtitle file content, preserving timestamps."""
    CHUNK = 3000
    chunks = [srt_content[i:i+CHUNK] for i in range(0, len(srt_content), CHUNK)]
    results = []
    for chunk in chunks:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": f"Translate this SRT subtitle content to {target_language}. Keep all SRT formatting (sequence numbers, timestamps like 00:00:00,000 --> 00:00:00,000) exactly unchanged. Only translate the dialogue text."},
                {"role": "user", "content": chunk},
            ],
            max_tokens=4096,
        )
        results.append(resp.choices[0].message.content)
    return "\n".join(results)

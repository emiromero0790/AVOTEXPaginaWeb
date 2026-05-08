import os

config = {
    "FIREBASE_API_KEY":              os.environ.get("FIREBASE_API_KEY", ""),
    "FIREBASE_AUTH_DOMAIN":          os.environ.get("FIREBASE_AUTH_DOMAIN", ""),
    "FIREBASE_PROJECT_ID":           os.environ.get("FIREBASE_PROJECT_ID", ""),
    "FIREBASE_STORAGE_BUCKET":       os.environ.get("FIREBASE_STORAGE_BUCKET", ""),
    "FIREBASE_MESSAGING_SENDER_ID":  os.environ.get("FIREBASE_MESSAGING_SENDER_ID", ""),
    "FIREBASE_APP_ID":               os.environ.get("FIREBASE_APP_ID", ""),
    "SUPABASE_URL":                  os.environ.get("SUPABASE_URL", ""),
    "SUPABASE_ANON_KEY":             os.environ.get("SUPABASE_ANON_KEY", ""),
}

js = "window.AVOTEX_CONFIG = " + str(config).replace("'", '"') + ";\n"

with open("config.js", "w") as f:
    f.write(js)

print("config.js generated successfully.")

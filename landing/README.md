# Landing page HatClaw

Página estática de divulgação e distribuição da extensão Chrome e do APK Android.

## Executar localmente

Na raiz do projeto:

```powershell
python -m http.server 4173 --directory landing
```

Acesse `http://localhost:4173`.

Os arquivos publicados em `downloads/` são artefatos locais de desenvolvimento. Gere novamente o ZIP da extensão e o APK antes de cada release.

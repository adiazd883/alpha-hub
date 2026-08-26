# ALPHA HUB

Starter de ALPHA HUB conectado a la Google Sheet original.

## Variables de Vercel

- `GOOGLE_SERVICE_ACCOUNT_JSON`: contenido completo del JSON de la cuenta de servicio.
- `GOOGLE_SPREADSHEET_ID`: ID de la Sheet original.
- `GOOGLE_SHEET_GID`: GID de la pestaña original.

No subir el JSON al repositorio.

## Roles

- ADMIN: control total.
- TL: puede asignar paralegal y editar fecha de entrega/status; no fechas esperadas.
- PARALEGAL / PSYCH / ANALYST: fecha de entrega/status.

La autenticación real por usuario debe agregarse antes de poner el HUB en uso operativo.

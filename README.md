# RFE HUB

RFE HUB conectado a la Google Sheet original.

## Variables de Vercel

- `GOOGLE_SERVICE_ACCOUNT_JSON`: contenido completo del JSON de la cuenta de servicio.
- `GOOGLE_SPREADSHEET_ID`: ID de la Sheet original.
- `GOOGLE_SHEET_GID`: GID de la pestaña original.
- `GOOGLE_SPREADSHEET_ID_GAMMA` (opcional): ID de la Sheet de Gamma; por defecto usa la de `lib/celulas.ts`.
- `SESSION_SECRET` (opcional): llave para firmar la sesión; si falta usa `GOOGLE_CLIENT_SECRET`.

## Células

Cada célula (`lib/celulas.ts`) lee la pestaña ADMINs de su propia Sheet. Admin, Manager y Coordinator ven todas; los demás solo la suya (`USER_CELULAS` en `lib/auth.ts`, por defecto Alpha).

No subir el JSON al repositorio.

## Roles

- ADMIN: control total.
- TL: puede asignar paralegal y editar fecha de entrega/status; no fechas esperadas.
- PARALEGAL / PSYCH / ANALYST: fecha de entrega/status.

La autenticación real por usuario debe agregarse antes de poner el HUB en uso operativo.

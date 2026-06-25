# AutoDM AI API

Documentacion de endpoints disponibles actualmente.

Base URL local:

```text
http://localhost:3000
```

Base URL de preproduccion:

```text
http://EC2_PUBLIC_IP:3000
```

Sustituir `EC2_PUBLIC_IP` por la IP publica actual de la instancia EC2.

## Health Check

Comprueba si la API esta viva.

```http
GET /health
```

### cURL

```bash
curl http://localhost:3000/health
```

### PowerShell

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get
```

### Respuesta

```json
{
  "status": "ok"
}
```

## Listar Workspaces

Devuelve los workspaces guardados en PostgreSQL.

```http
GET /workspaces
```

### cURL

```bash
curl http://localhost:3000/workspaces
```

### PowerShell

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/workspaces" -Method Get
```

### Respuesta Sin Datos

```json
{
  "data": []
}
```

### Respuesta Con Datos

```json
{
  "data": [
    {
      "id": "cmqstgp0s0000qy0i61uhlrxe",
      "name": "AutoDM AI",
      "createdAt": "2026-06-25T01:21:31.564Z",
      "updatedAt": "2026-06-25T01:21:31.564Z"
    }
  ]
}
```

## Crear Workspace

Crea un workspace nuevo.

```http
POST /workspaces
Content-Type: application/json
```

### Body

```json
{
  "name": "AutoDM AI Pre"
}
```

### cURL

```bash
curl -X POST http://localhost:3000/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name":"AutoDM AI Pre"}'
```

### PowerShell

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/workspaces" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"name":"AutoDM AI Pre"}'
```

### Respuesta

```json
{
  "data": {
    "id": "cmqstgp0s0000qy0i61uhlrxe",
    "name": "AutoDM AI Pre",
    "createdAt": "2026-06-25T01:21:31.564Z",
    "updatedAt": "2026-06-25T01:21:31.564Z"
  }
}
```

### Error: Name Vacio

Si `name` no existe, no es texto o esta vacio:

```json
{
  "error": "Workspace name is required"
}
```

Estado HTTP:

```text
400 Bad Request
```

## Probar En Preproduccion

Ejemplo usando EC2:

```bash
curl http://EC2_PUBLIC_IP:3000/workspaces
```

Crear workspace:

```bash
curl -X POST http://EC2_PUBLIC_IP:3000/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name":"Workspace desde pre"}'
```

Volver a listar:

```bash
curl http://EC2_PUBLIC_IP:3000/workspaces
```

## Notas Operativas

Si `/health` funciona pero `/workspaces` devuelve error de Prisma, comprobar:

- PostgreSQL esta levantado.
- La variable `DATABASE_URL` es correcta.
- Las migraciones fueron aplicadas con `prisma migrate deploy`.
- La tabla `Workspace` existe en la base de datos.

El endpoint `/health` solo valida que la API responde. No valida todavia la conexion a PostgreSQL.


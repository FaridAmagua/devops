# Aprendiendo DevOps con AutoDM AI: deploy tambien significa migrar la base de datos

En la parte anterior automatice el deploy de AutoDM AI a una instancia EC2 usando:

```text
GitHub Actions
OIDC
AWS Systems Manager
Docker Compose
```

El workflow quedaba verde, la API arrancaba y `/health` funcionaba.

Pero al probar un endpoint real:

```http
GET /workspaces
```

aparecio un error de Prisma:

```text
The table public.Workspace does not exist in the current database.
```

Ese error fue una buena leccion.

## El problema

El codigo nuevo ya usaba Prisma:

```text
Express -> Prisma Client -> PostgreSQL
```

Pero la base de datos de la EC2 no tenia aplicada la migracion que creaba la tabla `Workspace`.

En local si funcionaba porque ya habia ejecutado migraciones durante el desarrollo.

En preproduccion no.

La conclusion:

> Desplegar una aplicacion con base de datos no es solo levantar contenedores. Tambien hay que evolucionar el schema de la base de datos.

## La solucion

Actualice el workflow para que el deploy haga esto:

```bash
docker compose up --build -d postgres
docker compose run --rm api npx prisma migrate deploy
docker compose up --build -d
```

Primero levanta PostgreSQL.

Luego ejecuta las migraciones pendientes desde el contenedor de la API.

Finalmente levanta la aplicacion completa.

## migrate dev vs migrate deploy

Aprendi una diferencia importante:

```bash
prisma migrate dev
```

Es para desarrollo local. Puede crear nuevas migraciones y esta pensado para iterar.

```bash
prisma migrate deploy
```

Es para entornos como preproduccion y produccion. No crea migraciones nuevas: aplica las que ya estan versionadas en el repositorio.

## Otro detalle: Prisma Client en Docker

Tambien tuve que ajustar el `Dockerfile`.

No basta con instalar dependencias y compilar TypeScript. Prisma necesita generar el cliente:

```bash
npm run db:generate
```

Por eso el build de Docker copia `prisma/` y ejecuta `prisma generate` antes de compilar.

## Aprendizaje DevOps

Este fallo fue pequeno, pero muy real.

En una app con base de datos, el deploy debe coordinar:

- codigo
- imagen Docker
- variables de entorno
- schema de base de datos
- migraciones
- health checks

Si una de esas piezas no acompana, el contenedor puede estar "Up" pero la aplicacion no estar realmente lista.

Ahora el flujo de preproduccion queda asi:

```text
push a pre
  -> CI
  -> OIDC con AWS
  -> SSM Run Command
  -> levantar PostgreSQL
  -> aplicar migraciones Prisma
  -> levantar API
  -> validar /health
```

Siguiente paso:

mejorar el manejo de errores en Express para no exponer stack traces internos cuando algo falle.


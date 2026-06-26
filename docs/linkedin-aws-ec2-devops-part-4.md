# Aprendiendo DevOps con AutoDM AI: CI con PostgreSQL real

Despues de tener deploy automatico a preproduccion, el siguiente paso fue mejorar el pipeline de CI.

Hasta ahora el pipeline hacia:

```bash
npm ci
npm run lint
npm test
npm run build
```

Pero los primeros tests eran smoke tests sencillos. Validaban que `/health` funcionaba y que una request invalida devolvia `400`.

Eso estaba bien para empezar, pero faltaba algo importante:

> probar que la API realmente habla con PostgreSQL.

## La decision

Podia mockear Prisma, pero eso no me parecia el camino adecuado para aprender DevOps.

Un mock puede servir para unit tests, pero no valida la cadena completa:

```text
Express -> Prisma -> PostgreSQL
```

Asi que configure CI para levantar PostgreSQL real como servicio temporal.

## Como funciona

GitHub Actions crea un runner temporal:

```yaml
runs-on: ubuntu-latest
```

Dentro de ese runner se levanta un contenedor PostgreSQL:

```yaml
services:
  postgres:
    image: postgres:16-alpine
```

Ese Postgres no es mi EC2, no es RDS y no vive en AWS.

Existe solo durante el job.

Cuando el job termina, desaparece.

## Pipeline actual

El CI ahora hace:

```bash
npm ci
npm run lint
npx prisma migrate deploy
npm test
npm run build
```

El detalle clave es:

```bash
npx prisma migrate deploy
```

Antes de ejecutar tests, el pipeline aplica las migraciones a la base temporal.

Asi la tabla `Workspace` existe cuando los tests corren.

## Que prueban los tests

Ahora los tests validan:

```text
GET /health
POST /workspaces con body invalido
POST /workspaces creando un registro real
GET /workspaces leyendo desde PostgreSQL
```

Cada test limpia datos antes de ejecutarse para no depender del orden ni de ejecuciones anteriores.

## Aprendizaje importante

Este paso me ayudo a entender algo muy real:

> CI no deberia probar contra preproduccion ni produccion.

Los tests deben ejecutarse contra recursos aislados y temporales.

Para este proyecto:

```text
PostgreSQL de CI = contenedor temporal
PostgreSQL de pre = contenedor en EC2
PostgreSQL de prod = todavia pendiente
```

## Por que esto es DevOps

Porque no solo escribi tests.

Configure el entorno donde esos tests corren:

- runner temporal
- service container
- health check de PostgreSQL
- variable `DATABASE_URL`
- migraciones antes de tests
- separacion entre CI y entornos reales

Eso se parece mucho mas a un pipeline profesional que simplemente ejecutar comandos en local.

Siguiente paso:

empezar a preparar una estrategia de produccion mas seria:

- definir que significa `prod`
- decidir si usar RDS para PostgreSQL
- construir imagenes Docker versionadas
- publicar imagenes en un registry como ECR
- evaluar ECS antes de Kubernetes


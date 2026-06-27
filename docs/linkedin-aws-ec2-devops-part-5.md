# AutoDM AI DevOps Journey - Parte 5

## De PostgreSQL En Docker A RDS En AWS

En esta fase di un paso importante en el proyecto AutoDM AI:

```text
Antes:
EC2 + Docker Compose
  -> API
  -> PostgreSQL en contenedor

Ahora:
EC2 + Docker Compose
  -> API
  -> RDS PostgreSQL privado
```

El objetivo no era solo "hacer que funcione".

El objetivo era aprender una decision muy comun en DevOps:

```text
separar la aplicacion de la base de datos
```

## Por Que No Dejar PostgreSQL En Docker

Tener PostgreSQL en Docker Compose es perfecto para aprender y para desarrollo local.

Ventajas:

- rapido de levantar
- facil de borrar
- ideal para pruebas
- todo vive en un unico `docker-compose.yml`

Pero para un entorno tipo preproduccion tiene limitaciones:

- si la instancia falla, app y base caen juntas
- backups menos profesionales
- recuperacion mas manual
- peor separacion de responsabilidades
- menos parecido a un entorno real de empresa

Por eso movimos PostgreSQL a RDS.

## Que Es RDS

RDS es el servicio gestionado de bases de datos relacionales de AWS.

En vez de instalar y mantener PostgreSQL manualmente, AWS gestiona parte del trabajo pesado:

- motor PostgreSQL
- backups
- snapshots
- metricas
- mantenimiento
- almacenamiento
- disponibilidad segun la configuracion

La aplicacion sigue conectandose por `DATABASE_URL`, pero la base ya no vive dentro del servidor de la app.

## Decision De Seguridad

La base de datos no se dejo publica.

La regla fue:

```text
RDS solo acepta trafico PostgreSQL desde el Security Group de EC2
```

Esto significa:

- no se abre `5432` a internet
- mi IP personal no entra directamente a RDS
- la API en EC2 si puede conectarse
- el acceso queda limitado por red

Esta es una practica mucho mas cercana a un entorno real.

## Cambio En Docker Compose

Antes, el compose de pre tenia API y PostgreSQL.

Ahora `pre` usa un compose especifico:

```text
docker-compose.pre.yml
```

Ese archivo solo levanta:

```text
api
```

La base de datos se configura mediante:

```text
.env.pre
```

Ese archivo vive en EC2 y no se sube a Git.

Ejemplo:

```text
DATABASE_URL=postgresql://user:password@endpoint-rds:5432/autodm?schema=public
PORT=3000
```

En el repositorio solo dejamos:

```text
.env.pre.example
```

La plantilla ayuda a documentar lo que necesita el entorno sin exponer secretos.

## Migraciones Con Prisma

El deploy de pre ejecuta:

```bash
npx prisma migrate deploy
```

Esto aplica migraciones ya versionadas.

Es importante diferenciar:

```text
prisma migrate dev
```

Para desarrollo local.

```text
prisma migrate deploy
```

Para preproduccion y produccion.

Una leccion importante fue que si el codigo espera una tabla nueva pero no se aplican migraciones, la API puede romperse aunque el contenedor este levantado.

## Error Real Que Aprendi A Diagnosticar

Durante la configuracion aparecio:

```text
P1000: Authentication failed against database server
```

La causa estaba en la `DATABASE_URL`.

Cuando una password contiene caracteres especiales, puede romper el formato de URL si no se codifica correctamente.

Ejemplo conceptual:

```text
@  -> %40
#  -> %23
/  -> %2F
```

Leccion:

```text
un error de autenticacion no siempre significa usuario o password incorrectos;
tambien puede ser una URL mal formada
```

## Deploy Actual

El flujo actual queda asi:

```text
push a pre
  -> GitHub Actions CI
  -> GitHub Actions Deploy Pre
  -> OIDC contra AWS
  -> Systems Manager Run Command
  -> EC2 ejecuta deploy
  -> Prisma aplica migraciones en RDS
  -> Docker Compose levanta la API
  -> health check
```

Y sin guardar claves SSH privadas en GitHub.

## Que Aprendi

En esta fase practique:

- RDS PostgreSQL
- Security Groups entre servicios
- variables de entorno por entorno
- separacion entre local y preproduccion
- migraciones Prisma en deploy
- troubleshooting de `DATABASE_URL`
- despliegue por SSM
- health checks despues del deploy

## Siguiente Paso

El siguiente paso natural es ECR:

```text
build once
push image to registry
deploy same image
```

Hasta ahora EC2 reconstruye la imagen durante el deploy.

Con ECR, el pipeline podria construir una imagen versionada y despues desplegar exactamente ese artefacto.

Ese cambio acerca el proyecto a patrones reales de CI/CD.

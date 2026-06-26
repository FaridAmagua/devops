# Production Strategy

Estrategia propuesta para evolucionar AutoDM AI desde el entorno actual de aprendizaje hacia una arquitectura mas cercana a produccion.

Este documento no crea infraestructura. Define decisiones, riesgos y siguientes fases.

## Estado Actual

Actualmente el proyecto tiene:

- Backend Node.js + TypeScript + Express.
- Dockerfile.
- Docker Compose con API + PostgreSQL.
- Prisma con migraciones.
- GitHub Actions CI.
- Tests con PostgreSQL temporal en CI.
- Deploy automatico a `pre` usando OIDC + AWS Systems Manager.
- Una instancia EC2 de preproduccion con Docker Compose.

Flujo actual:

```text
main -> pre

push a pre
  -> CI
  -> Deploy Pre
  -> EC2 pre
  -> Docker Compose
  -> API + PostgreSQL
```

## Principio Principal

`pre` y `prod` deben ser entornos separados.

No basta con tener ramas separadas.

Tambien deben separarse:

- infraestructura
- base de datos
- secrets
- logs
- permisos IAM
- dominios
- reglas de despliegue

## Que No Debe Hacerse

No usar la misma EC2 para `pre` y `prod`.

No usar la misma base de datos para `pre` y `prod`.

No ejecutar tests contra `prod`.

No abrir PostgreSQL publicamente a internet.

No guardar claves privadas SSH en GitHub si existe una alternativa con OIDC/SSM.

No desplegar a produccion sin CI verde.

No desplegar a produccion sin una estrategia de rollback.

## Entornos Objetivo

### Preproduccion

Uso:

- validar cambios antes de produccion
- ejecutar pruebas manuales
- validar migraciones
- probar integraciones

Recursos recomendados:

```text
app-pre
db-pre
secrets-pre
logs-pre
domain-pre
```

Ejemplo de dominio:

```text
api-pre.autodm.ai
```

### Produccion

Uso:

- trafico real de usuarios
- datos reales
- maxima estabilidad

Recursos recomendados:

```text
app-prod
db-prod
secrets-prod
logs-prod
domain-prod
```

Ejemplo de dominio:

```text
api.autodm.ai
```

## Arquitectura Recomendada En AWS

Camino evolutivo recomendado:

```text
EC2 + Docker Compose
  -> RDS PostgreSQL
  -> ECR
  -> ECS Fargate
  -> Kubernetes/EKS
```

### Fase Actual: EC2 + Docker Compose

Ventajas:

- facil de entender
- buena base para aprender Linux, Docker y redes
- bajo numero de piezas

Limitaciones:

- app y DB viven en la misma instancia
- backups manuales o limitados
- escalado dificil
- recuperacion ante fallos mas debil

### Siguiente Paso Recomendado: RDS PostgreSQL

Mover PostgreSQL fuera de Docker Compose.

Ventajas:

- backups gestionados
- snapshots
- metricas
- separacion app/base de datos
- mejor aproximacion a produccion real

Cambios esperados:

```text
EC2 Docker Compose:
  api

RDS:
  PostgreSQL
```

La app se conectaria a RDS usando `DATABASE_URL`.

### Siguiente Paso: ECR

Publicar imagenes Docker en Amazon Elastic Container Registry.

Ventajas:

- imagenes versionadas
- mismo artefacto para pre y prod
- base para ECS/EKS

Objetivo:

```text
build once
promote same image
```

Esto evita reconstruir una imagen distinta para produccion.

### Siguiente Paso: ECS Fargate

Ejecutar contenedores sin administrar servidores EC2 directamente.

Ventajas:

- menos mantenimiento de servidores
- integracion natural con AWS
- escalado mas sencillo
- mas simple que Kubernetes

### Kubernetes/EKS

Kubernetes deberia llegar despues de entender:

- imagenes en registry
- secrets
- health checks
- logs
- deploys
- rollback
- base de datos externa

Mapeo futuro:

```text
Docker Compose service -> Kubernetes Deployment
Docker Compose network  -> Kubernetes Service
env vars                -> ConfigMap / Secret
/health                 -> readinessProbe / livenessProbe
docker compose logs     -> kubectl logs
```

## Estrategia De Ramas

Ramas actuales:

```text
main -> desarrollo integrado
pre  -> preproduccion
prod -> produccion
```

Flujo:

```text
main -> pre -> prod
```

`main`:

- recibe cambios desarrollados
- ejecuta CI

`pre`:

- recibe promociones desde `main`
- ejecuta CI
- despliega automaticamente a pre

`prod`:

- recibe promociones desde `pre`
- debe ejecutar CI
- debe requerir aprobacion manual antes de desplegar

## Workflows Objetivo

### CI

Debe ejecutarse en:

```text
main
pre
prod
pull requests
```

Debe validar:

```bash
npm ci
npm run lint
npx prisma migrate deploy
npm test
npm run build
```

En CI, PostgreSQL debe ser temporal y aislado.

### Deploy Pre

Trigger:

```text
push a pre
```

Flujo:

```text
GitHub Actions
  -> OIDC
  -> AWS SSM
  -> EC2 pre
  -> prisma migrate deploy
  -> docker compose up
  -> health check
```

### Deploy Prod

Trigger recomendado:

```text
push a prod
```

o:

```text
release/tag
```

Debe incluir:

- CI verde
- aprobacion manual
- entorno GitHub `production`
- secrets separados
- rol IAM separado
- base de datos separada
- health check
- rollback definido

## GitHub Environments

Usar GitHub Environments:

```text
pre
production
```

Para `production`, configurar:

- required reviewers
- environment secrets
- deployment history

Secrets por entorno:

```text
PRE_AWS_ROLE_ARN
PRE_EC2_INSTANCE_ID
PROD_AWS_ROLE_ARN
PROD_EC2_INSTANCE_ID
```

O si se usa ECS:

```text
PRE_ECS_CLUSTER
PRE_ECS_SERVICE
PROD_ECS_CLUSTER
PROD_ECS_SERVICE
```

## Secrets

No guardar secrets reales en archivos.

Usar:

- GitHub Environment Secrets
- AWS Secrets Manager
- AWS SSM Parameter Store

Variables no sensibles pueden vivir en configuracion.

Secrets sensibles:

- `DATABASE_URL`
- passwords
- tokens
- API keys
- claves privadas

## Base De Datos

Para produccion real:

```text
RDS PostgreSQL
```

Separar:

```text
RDS pre
RDS prod
```

Antes de produccion:

- backups habilitados
- ventana de mantenimiento definida
- seguridad de red revisada
- acceso publico deshabilitado
- Security Group restrictivo
- migraciones probadas en pre

## HTTPS Y Dominio

Produccion debe usar HTTPS.

Opciones futuras:

- Load Balancer + ACM
- CloudFront + ALB
- API Gateway
- reverse proxy con Nginx y Let's Encrypt en EC2

Para AWS gestionado, preferir:

```text
ACM + Load Balancer
```

## Logs Y Observabilidad

Minimo esperado:

- logs de aplicacion
- logs de deploy
- metricas de CPU/memoria
- metricas de base de datos
- alarmas de coste
- alarmas de disponibilidad

En AWS:

- CloudWatch Logs
- CloudWatch Metrics
- CloudWatch Alarms

## Rollback

Rollback actual con EC2 + Compose:

- volver a commit anterior
- redeploy de rama
- restaurar backup si hubo migracion destructiva

Rollback futuro con imagenes:

```text
redeploy imagen anterior
```

Importante:

Las migraciones de base de datos pueden hacer rollback mas dificil. Evitar migraciones destructivas sin plan.

## Orden Recomendado De Proximas Fases

1. Mantener CI con PostgreSQL temporal.
2. Mejorar tests de integracion.
3. Crear RDS para pre.
4. Mover `pre` de PostgreSQL en Docker a RDS.
5. Crear ECR.
6. Construir y publicar imagenes Docker versionadas.
7. Evaluar ECS Fargate para pre.
8. Disenar deploy prod con aprobacion manual.
9. Crear RDS prod.
10. Crear deploy prod.
11. Evaluar Kubernetes/EKS.

## Decision Actual

No implementar Kubernetes todavia.

Antes, el proyecto debe tener:

- base de datos externa
- imagenes versionadas
- secrets gestionados
- deploys repetibles
- rollback claro
- observabilidad basica


# Aprendiendo DevOps con AutoDM AI: de SSH a OIDC + SSM en AWS

En la primera parte desplegue AutoDM AI manualmente en una instancia EC2 usando Docker Compose.

Ese primer paso fue intencional: queria entender el camino completo antes de automatizarlo.

El flujo inicial era:

```text
GitHub
  -> EC2 por SSH
  -> git pull
  -> docker compose up --build -d
```

Funcionaba, pero al intentar automatizarlo desde GitHub Actions aparecio un problema muy real:

```text
dial tcp ...:22: i/o timeout
```

La causa era sencilla:

> El Security Group permitia SSH solo desde mi IP, pero GitHub Actions no se ejecuta desde mi ordenador.

GitHub Actions corre en runners externos, con IPs distintas. Por eso AWS bloqueaba el puerto 22.

## La decision importante

Podia resolverlo rapido abriendo SSH a todo internet:

```text
22 -> 0.0.0.0/0
```

Pero preferi no hacerlo.

Abrir SSH globalmente puede funcionar para una prueba, pero no es la practica que queria aprender.

Asi que cambie el enfoque:

```text
GitHub Actions
  -> OIDC
  -> AWS STS AssumeRole
  -> AWS Systems Manager Run Command
  -> EC2
```

## Que configure

En AWS:

- Rol IAM para la instancia EC2.
- Politica `AmazonSSMManagedInstanceCore`.
- Amazon SSM Agent activo en la EC2.
- Proveedor OIDC de GitHub en IAM.
- Rol IAM especifico para GitHub Actions.
- Politica minima para ejecutar `ssm:SendCommand`.

En GitHub:

- `AWS_ROLE_ARN`
- `AWS_REGION`
- `EC2_INSTANCE_ID`

Y elimine la necesidad de usar la clave SSH privada como secret de deploy.

## Que hace ahora el workflow

Cuando hago push a la rama `pre`:

```text
GitHub Actions obtiene un token OIDC
AWS valida que viene de FaridAmagua/devops y de la rama pre
GitHub asume un rol temporal en AWS
SSM envia un comando a la instancia EC2
La EC2 actualiza el repo y levanta Docker Compose
El workflow valida /health
```

Comandos ejecutados dentro de EC2:

```bash
cd /home/ubuntu/devops
git fetch origin
git checkout pre
git pull origin pre
docker compose up --build -d
curl --fail http://localhost:3000/health
```

## Lo que aprendi

Un runner de GitHub Actions no es mi maquina local.

Restringir SSH a "Mi IP" protege la EC2, pero tambien impide que runners externos entren por SSH.

OIDC permite evitar access keys permanentes.

AWS STS emite credenciales temporales.

Systems Manager permite ejecutar comandos en EC2 sin abrir SSH publicamente.

Los roles IAM separan responsabilidades:

```text
Rol EC2 -> permite que la instancia sea administrada por SSM
Rol GitHub -> permite que GitHub pida ejecutar comandos SSM
```

El deploy ya no depende de una clave privada SSH guardada en GitHub.

## Estado actual

Ahora el flujo de preproduccion es:

```text
push a pre
  -> CI
  -> Deploy Pre
  -> OIDC
  -> SSM
  -> Docker Compose en EC2
```

Este paso hizo que el proyecto pasara de "deploy manual que funciona" a un primer CD real con una base de seguridad mucho mejor.

Siguiente objetivo:

```text
mejorar la app con endpoints reales usando Prisma
separar configuracion de pre/prod
preparar una estrategia de rollback
mas adelante evolucionar a RDS, ECR/ECS y Kubernetes
```

Lo mas interesante no fue solo que el check quedara verde.

Lo interesante fue entender por que fallo SSH, que riesgo tenia la solucion rapida, y como resolverlo con una arquitectura mas profesional.


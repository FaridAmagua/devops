# AWS EC2 Runbook

Runbook operativo para desplegar y mantener AutoDM AI en una instancia EC2 con Docker Compose, RDS PostgreSQL y AWS Systems Manager.

El despliegue principal a preproduccion se ejecuta desde GitHub Actions usando OIDC y AWS Systems Manager Run Command. El acceso por SSH queda como fallback operativo.

## Contexto

Arquitectura actual de preproduccion:

```text
GitHub repository
  -> GitHub Actions
  -> AWS OIDC role
  -> AWS Systems Manager Run Command
  -> EC2 Ubuntu
  -> Docker Compose
  -> API Node.js
  -> RDS PostgreSQL privado
```

Rama usada para la instancia de preproduccion:

```text
pre
```

Compose local:

```text
docker-compose.yml
  api
  postgres
```

Compose de preproduccion:

```text
docker-compose.pre.yml
  api
```

En `pre`, PostgreSQL vive en RDS, no dentro de Docker Compose.

## Requisitos Previos

En AWS:

- MFA activo en root.
- AWS Budget creado.
- Security Group de EC2 creado.
- Instancia EC2 creada con Ubuntu.
- Rol IAM de EC2 con `AmazonSSMManagedInstanceCore`.
- Proveedor OIDC de GitHub creado en IAM.
- Rol IAM de GitHub Actions para ejecutar comandos SSM sobre la instancia de pre.
- RDS PostgreSQL privado creado para pre.
- Security Group de RDS permitiendo PostgreSQL `5432` solo desde el Security Group de EC2.

En la instancia EC2:

- Docker instalado.
- Docker Compose v2 instalado.
- Usuario `ubuntu` agregado al grupo `docker`.
- Repositorio clonado desde GitHub.
- Amazon SSM Agent activo y registrado.
- Archivo `/home/ubuntu/devops/.env.pre` creado manualmente.

En GitHub:

- Secret `AWS_ROLE_ARN`.
- Secret `AWS_REGION`.
- Secret `EC2_INSTANCE_ID`.

## Variables De Entorno En Pre

El archivo real vive solo en EC2:

```text
/home/ubuntu/devops/.env.pre
```

Ejemplo:

```text
DATABASE_URL=postgresql://autodm:PASSWORD_ENCODED@autodm-ai-pre.c9mg4i4w61u4.eu-west-1.rds.amazonaws.com:5432/autodm?schema=public
PORT=3000
```

Este archivo no debe subirse a Git.

El repositorio solo contiene una plantilla:

```text
.env.pre.example
```

Si la password contiene caracteres especiales como `@`, `/`, `#`, `%` o `:`, hay que codificarla para URL. Si no, Prisma puede devolver:

```text
Error: P1000: Authentication failed against database server
```

## CI Con PostgreSQL Temporal

El workflow de CI vive en:

```text
.github/workflows/ci.yml
```

Se ejecuta en:

```text
main
pre
prod
pull requests hacia main, pre y prod
```

El job usa un runner temporal de GitHub:

```yaml
runs-on: ubuntu-latest
```

Dentro del job se levanta PostgreSQL como service container:

```yaml
services:
  postgres:
    image: postgres:16-alpine
```

Este PostgreSQL:

- Solo existe durante el job.
- No es la base de datos de EC2.
- No es RDS.
- No persiste datos al terminar.
- No genera coste en AWS.

Credenciales usadas en CI:

```text
POSTGRES_USER=autodm
POSTGRES_PASSWORD=autodm
POSTGRES_DB=autodm_test
```

Estas credenciales son aceptables porque pertenecen a una base efimera de test. No usar este patron para bases reales de preproduccion o produccion.

Orden del CI:

```bash
npm ci
npm run lint
npx prisma migrate deploy
npm test
npm run build
```

Regla operativa:

```text
tests de CI no deben escribir en pre ni prod
```

## Deploy Automatico A Pre

El workflow de deploy vive en:

```text
.github/workflows/deploy-pre.yml
```

Se ejecuta al hacer push a:

```text
pre
```

Flujo:

```text
push a pre
  -> GitHub Actions
  -> OIDC token
  -> AssumeRole en AWS
  -> SSM SendCommand
  -> EC2 ejecuta deploy localmente
```

Comandos equivalentes que SSM ejecuta dentro de EC2:

```bash
set -e
cd /home/ubuntu/devops
git fetch origin
git checkout pre
git pull origin pre
test -f .env.pre
docker compose -f docker-compose.pre.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.pre.yml up --build -d --remove-orphans
docker compose -f docker-compose.pre.yml ps
curl --fail http://localhost:3000/health
```

Para disparar un deploy:

```bash
git checkout pre
git merge main
git push
git checkout main
```

GitHub Actions debe mostrar `CI` y `Deploy Pre` en verde.

## Migraciones Prisma En Deploy

El deploy debe aplicar migraciones antes de dejar la API como version final.

Comando usado en pre:

```bash
docker compose -f docker-compose.pre.yml run --rm api npx prisma migrate deploy
```

Por que se ejecuta desde el servicio `api`:

- La imagen de API contiene Node.js, Prisma CLI y el schema.
- El contenedor recibe `DATABASE_URL` desde `.env.pre`.
- `migrate deploy` aplica migraciones pendientes sin crear nuevas migraciones.

Diferencia importante:

```text
prisma migrate dev
```

Se usa en desarrollo local. Puede crear nuevas migraciones y esta pensado para iterar durante desarrollo.

```text
prisma migrate deploy
```

Se usa en preproduccion y produccion. Solo aplica migraciones existentes y versionadas.

Si se despliega codigo que usa una tabla nueva pero no se ejecutan migraciones, la API puede fallar con:

```text
The table public.Workspace does not exist in the current database.
```

## RDS PostgreSQL En Pre

RDS es la base gestionada por AWS. En nuestro caso sustituye al contenedor `postgres` de pre.

Ventajas:

- La base no se reinicia con la app.
- Backups y snapshots gestionados por AWS.
- Separacion entre computo y datos.
- Seguridad de red mas parecida a un entorno real.

Decisiones tomadas:

- RDS no tiene acceso publico.
- El puerto `5432` no se abre a internet.
- RDS solo acepta trafico desde el Security Group de EC2.
- La API obtiene la conexion desde `.env.pre`.

Comprobar conectividad desde EC2:

```bash
nc -vz autodm-ai-pre.c9mg4i4w61u4.eu-west-1.rds.amazonaws.com 5432
```

Conectar con `psql` desde EC2:

```bash
psql "host=autodm-ai-pre.c9mg4i4w61u4.eu-west-1.rds.amazonaws.com port=5432 dbname=autodm user=autodm sslmode=require"
```

Si `\l` falla por diferencia de versiones entre cliente y servidor, usar:

```sql
SELECT datname FROM pg_database;
```

## Verificar SSM En EC2

Comprobar agente SSM dentro de la instancia:

```bash
sudo systemctl status snap.amazon-ssm-agent.amazon-ssm-agent.service
```

Debe aparecer:

```text
active (running)
```

Comprobar que la instancia tiene rol IAM asociado:

```bash
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

Resultado esperado:

```text
autodm-ai-ec2-ssm-role
```

Si el agente necesita refrescar credenciales:

```bash
sudo systemctl restart snap.amazon-ssm-agent.amazon-ssm-agent.service
sudo journalctl -u snap.amazon-ssm-agent.amazon-ssm-agent.service -n 40 --no-pager
```

## GitHub Secrets Actuales

Secrets necesarios:

```text
AWS_ROLE_ARN
AWS_REGION
EC2_INSTANCE_ID
```

Secrets antiguos del flujo SSH que no deberian ser necesarios:

```text
EC2_HOST
EC2_USER
EC2_SSH_KEY
```

Una vez validado SSM/OIDC, eliminar especialmente `EC2_SSH_KEY` de GitHub Secrets.

## Conexion SSH Manual

SSH queda como fallback de administracion, no como mecanismo principal de deploy.

Desde la maquina local:

```powershell
ssh -i .\autodm-ai-key.pem ubuntu@EC2_PUBLIC_IP
```

Ejemplo de prompt correcto dentro de EC2:

```text
ubuntu@ip-172-31-xx-xx:~$
```

Si el prompt empieza por `PS C:\Users\...`, todavia estas en Windows local, no dentro de EC2.

## Permisos De La Clave SSH En Windows

Si SSH muestra:

```text
WARNING: UNPROTECTED PRIVATE KEY FILE
Permissions are too open
```

Restringir permisos de la clave:

```powershell
icacls .\autodm-ai-key.pem /inheritance:r
$user = "$env:USERDOMAIN\$env:USERNAME"
icacls .\autodm-ai-key.pem /grant:r "${user}:R"
```

## Comprobar Docker

Dentro de EC2:

```bash
docker --version
docker compose version
docker ps
```

Si `docker ps` falla por permisos, comprobar grupos:

```bash
groups
```

Debe aparecer:

```text
docker
```

Si no aparece:

```bash
sudo usermod -aG docker ubuntu
exit
```

Volver a entrar por SSH.

## Ir Al Proyecto

Dentro de EC2:

```bash
cd ~/devops
```

Comprobar rama:

```bash
git branch
```

La rama activa debe ser:

```text
pre
```

## Levantar La Aplicacion En Pre

Dentro de `~/devops`:

```bash
docker compose -f docker-compose.pre.yml up --build -d --remove-orphans
```

Significado:

- `-f docker-compose.pre.yml`: usa la configuracion de pre.
- `up`: crea o arranca los servicios.
- `--build`: reconstruye la imagen de la API.
- `-d`: ejecuta en segundo plano.
- `--remove-orphans`: limpia contenedores antiguos que ya no estan en el compose actual, como el antiguo `postgres`.

## Comprobar Estado

```bash
docker compose -f docker-compose.pre.yml ps
```

Servicio esperado:

```text
api
```

El servicio debe estar en estado `Up`.

## Probar Health Check

Dentro de EC2:

```bash
curl http://localhost:3000/health
```

Respuesta esperada:

```json
{"status":"ok"}
```

Desde navegador local:

```text
http://EC2_PUBLIC_IP:3000/health
```

Si funciona dentro de EC2 pero no desde el navegador, revisar el Security Group de EC2.

## Ver Logs

Logs de la API:

```bash
docker compose -f docker-compose.pre.yml logs api
```

Logs en tiempo real:

```bash
docker compose -f docker-compose.pre.yml logs -f api
```

Salir de logs en tiempo real:

```text
Ctrl + C
```

## Apagar Contenedores

```bash
docker compose -f docker-compose.pre.yml down
```

Esto elimina contenedores y red de Docker Compose.

No elimina RDS.

## Detener La Instancia Para Ahorrar Costes

En AWS:

```text
EC2 -> Instancias -> seleccionar instancia -> Estado de instancia -> Detener instancia
```

Notas:

- Detener evita coste de computo EC2.
- El volumen EBS puede seguir generando coste.
- RDS sigue generando coste si queda encendido.
- Terminar instancia elimina la instancia.

## Errores Comunes

### GitHub Actions No Puede Conectar Por SSH

Si aparece:

```text
dial tcp ...:22: i/o timeout
```

No abrir SSH a `0.0.0.0/0` como solucion permanente.

El flujo actual debe usar:

```text
GitHub Actions -> OIDC -> AWS SSM -> EC2
```

### La Instancia No Aparece En Run Command

Comprobar:

- Rol IAM de EC2 asociado.
- Politica `AmazonSSMManagedInstanceCore` en el rol de EC2.
- SSM Agent activo.
- Salida a internet desde la instancia.
- Region correcta en Systems Manager.

### Security Group Bloqueando Acceso

Reglas de entrada esperadas en EC2:

```text
22   SSH        desde Mi IP
3000 API Node   desde Mi IP
```

Regla de entrada esperada en RDS:

```text
5432 PostgreSQL desde Security Group de EC2
```

No abrir RDS a:

```text
0.0.0.0/0
```

### Probar PostgreSQL En Navegador

No usar:

```text
http://EC2_PUBLIC_IP:5432
```

PostgreSQL no habla HTTP. Usa protocolo propio de base de datos.

### Error P1000 De Prisma

Si aparece:

```text
Authentication failed against database server
```

Revisar:

- usuario
- password
- nombre de base de datos
- endpoint
- si la password necesita URL encoding
- si `.env.pre` esta actualizado en EC2

### La App Funciona En EC2 Pero No Desde Fuera

Comprobar:

- La instancia esta en ejecucion.
- La IP publica es correcta.
- El contenedor `api` esta `Up`.
- Security Group permite puerto `3000` desde la IP actual.
- La IP publica local no ha cambiado.

## Flujo Manual Completo

Este flujo se usa como fallback por SSH.

```bash
cd ~/devops
git fetch origin
git checkout pre
git pull origin pre
test -f .env.pre
docker compose -f docker-compose.pre.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.pre.yml up --build -d --remove-orphans
docker compose -f docker-compose.pre.yml ps
curl http://localhost:3000/health
```

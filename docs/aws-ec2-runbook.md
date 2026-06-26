# AWS EC2 Runbook

Runbook operativo para desplegar y mantener AutoDM AI en una instancia EC2 con Docker Compose y AWS Systems Manager.

El despliegue principal a preproduccion se ejecuta desde GitHub Actions usando OIDC y AWS Systems Manager Run Command. El flujo manual por SSH queda documentado como fallback operativo.

## Contexto

Arquitectura actual:

```text
GitHub repository
  -> GitHub Actions
  -> AWS OIDC role
  -> AWS Systems Manager Run Command
  -> EC2 Ubuntu
  -> Docker Compose
  -> API Node.js + PostgreSQL
```

Rama usada para la instancia de preproduccion:

```text
pre
```

Servicios definidos en Docker Compose:

```text
api
postgres
```

## Requisitos Previos

En AWS:

- MFA activo en root.
- MFA activo en usuario IAM.
- AWS Budget creado.
- Key pair creada para SSH.
- Security Group creado.
- Instancia EC2 creada con Ubuntu.
- Rol IAM de EC2 con `AmazonSSMManagedInstanceCore`.
- Rol IAM de GitHub Actions para ejecutar comandos SSM sobre la instancia de pre.
- Proveedor OIDC de GitHub creado en IAM.

En la instancia EC2:

- Docker instalado.
- Docker Compose v2 instalado.
- Usuario `ubuntu` agregado al grupo `docker`.
- Repositorio clonado desde GitHub.
- Amazon SSM Agent activo y registrado.

En GitHub:

- Secret `AWS_ROLE_ARN`.
- Secret `AWS_REGION`.
- Secret `EC2_INSTANCE_ID`.

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

El paso de migraciones prepara la base temporal antes de ejecutar tests de integracion.

Los tests validan:

- `GET /health`.
- validacion de `POST /workspaces`.
- creacion real de workspace en PostgreSQL.
- lectura real con `GET /workspaces`.

Regla operativa:

```text
tests de CI no deben escribir en pre ni prod
```

Cada pipeline debe usar recursos temporales o bases de test aisladas.

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

Comandos que SSM ejecuta dentro de EC2:

```bash
set -e
cd /home/ubuntu/devops
git fetch origin
git checkout pre
git pull origin pre
docker compose up --build -d postgres
docker compose run --rm api npx prisma migrate deploy
docker compose up --build -d
docker compose ps
curl --fail http://localhost:3000/health
```

Para disparar un deploy:

```bash
git checkout pre
git merge main
git push
git checkout main
```

GitHub Actions debe mostrar el workflow `Deploy Pre` en verde.

## Migraciones Prisma En Deploy

El deploy debe aplicar migraciones antes de dejar la API como version final.

Comando usado en pre:

```bash
docker compose run --rm api npx prisma migrate deploy
```

Por que se ejecuta desde el servicio `api`:

- La imagen de API contiene Node.js, Prisma CLI y el schema.
- El contenedor tiene la variable `DATABASE_URL` definida por Docker Compose.
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

Si se despliega codigo que usa una tabla nueva pero no se ejecutan migraciones, la API puede fallar con errores como:

```text
The table public.Workspace does not exist in the current database.
```

Regla operativa:

```text
codigo nuevo + schema nuevo = deploy debe incluir migraciones
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

En AWS Systems Manager, una prueba basica con `AWS-RunShellScript` puede ejecutar:

```bash
whoami
pwd
hostname
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

Despues reintentar SSH.

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

Si no lo es:

```bash
git checkout pre
```

## Actualizar Codigo En Pre

Dentro de `~/devops`:

```bash
git fetch origin
git checkout pre
git pull origin pre
```

Comprobar ultimos commits:

```bash
git log --oneline --decorate -5
```

## Levantar La Aplicacion

Dentro de `~/devops`:

```bash
docker compose up --build -d
```

Significado:

- `up`: crea o arranca los servicios.
- `--build`: reconstruye la imagen de la API.
- `-d`: ejecuta en segundo plano.

## Comprobar Estado

```bash
docker compose ps
```

Los servicios esperados:

```text
api
postgres
```

Ambos deben estar en estado `Up`.

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

Si funciona dentro de EC2 pero no desde el navegador, revisar el Security Group.

## Ver Logs

Logs de la API:

```bash
docker compose logs api
```

Logs de PostgreSQL:

```bash
docker compose logs postgres
```

Logs en tiempo real:

```bash
docker compose logs -f api
```

Salir de logs en tiempo real:

```text
Ctrl + C
```

## Apagar Contenedores

```bash
docker compose down
```

Esto elimina contenedores y red de Docker Compose.

No elimina volumenes por defecto.

No usar salvo que se quiera borrar datos locales:

```bash
docker compose down -v
```

`-v` elimina volumenes, incluyendo datos de PostgreSQL.

## Detener La Instancia Para Ahorrar Costes

En AWS:

```text
EC2 -> Instancias -> seleccionar instancia -> Estado de instancia -> Detener instancia
```

Notas:

- Detener evita coste de computo EC2.
- El volumen EBS puede seguir generando coste.
- Terminar instancia elimina la instancia.
- Si el volumen raiz tiene "Eliminar al terminar", tambien se elimina al terminar la instancia.

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

Si los logs muestran `AccessDeniedException`, reiniciar el agente tras asociar el rol:

```bash
sudo systemctl restart snap.amazon-ssm-agent.amazon-ssm-agent.service
```

### Usar IP Incorrecta

Para SSH hay que usar la IP publica de EC2, no la IP publica local detectada por "Mi IP".

Correcto:

```powershell
ssh -i .\autodm-ai-key.pem ubuntu@EC2_PUBLIC_IP
```

### Security Group Bloqueando Acceso

Reglas de entrada esperadas:

```text
22   SSH        desde Mi IP
3000 API Node   desde Mi IP
```

No abrir:

```text
5432 PostgreSQL
```

### Probar PostgreSQL En Navegador

No usar:

```text
http://EC2_PUBLIC_IP:5432
```

PostgreSQL no habla HTTP. Usa protocolo propio de base de datos.

### Instancia Sin Grupo Docker Aplicado

Si `docker ps` necesita `sudo`, cerrar sesion y volver a entrar tras:

```bash
sudo usermod -aG docker ubuntu
```

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
docker compose up --build -d postgres
docker compose run --rm api npx prisma migrate deploy
docker compose up --build -d
docker compose ps
curl http://localhost:3000/health
```


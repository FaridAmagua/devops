# AWS EC2 Runbook

Runbook operativo para desplegar y mantener AutoDM AI en una instancia EC2 con Docker Compose.

Este documento describe el flujo manual. Mas adelante este proceso se automatizara con GitHub Actions.

## Contexto

Arquitectura actual:

```text
GitHub repository
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

En la instancia EC2:

- Docker instalado.
- Docker Compose v2 instalado.
- Usuario `ubuntu` agregado al grupo `docker`.
- Repositorio clonado desde GitHub.

## Conexion SSH

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

```bash
cd ~/devops
git fetch origin
git checkout pre
git pull origin pre
docker compose up --build -d
docker compose ps
curl http://localhost:3000/health
```


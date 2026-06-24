# Aprendiendo DevOps desplegando AutoDM AI en AWS

Estos dias estuve construyendo AutoDM AI, una aplicacion SaaS tipo ManyChat, pero usando el proyecto como excusa para aprender DevOps de forma practica.

La idea no fue solo "hacer que funcione", sino entender cada pieza del camino:

- Git y estrategia de ramas
- Docker
- Docker Compose
- GitHub Actions
- PostgreSQL
- Prisma
- AWS EC2
- Seguridad basica en cloud
- Despliegue manual como base para CI/CD

## Lo que construi

Empece con un backend minimo en Node.js, TypeScript y Express:

```http
GET /health
```

Ese endpoint parece simple, pero es clave en DevOps. Sirve para comprobar si la aplicacion esta viva y mas adelante puede utilizarse en despliegues, balanceadores, contenedores o Kubernetes.

Despues dockerice la aplicacion con un `Dockerfile` y use `docker-compose.yml` para levantar dos servicios:

- API Node/Express
- PostgreSQL

Tambien anadi Prisma para gestionar el schema de base de datos y crear migraciones versionadas.

## Git y ramas

Use tres ramas:

```text
main -> desarrollo principal
pre  -> preproduccion
prod -> produccion
```

Primero desarrolle en `main`, luego promocione cambios a `pre` y finalmente a `prod`.

Este flujo me ayudo a entender una idea importante:

> Las ramas pueden representar etapas del ciclo de vida del software, no solo lugares donde escribir codigo.

## CI con GitHub Actions

Configure un workflow de CI que se ejecuta al hacer push a:

```text
main
pre
prod
```

El pipeline ejecuta:

```bash
npm ci
npm run lint
npm run build
```

Con esto, GitHub valida automaticamente que el proyecto instala dependencias, pasa lint y compila antes de avanzar.

## AWS: primero seguridad, luego infraestructura

Antes de crear servidores en AWS, configure algunos guardrails:

- MFA en root
- MFA en usuario IAM
- AWS Budget con alertas
- Region de trabajo
- Key pair para SSH
- Security Group restrictivo

Una decision importante fue no abrir PostgreSQL a internet.

Reglas de entrada usadas para EC2:

```text
22   SSH        solo desde mi IP
3000 API Node   solo desde mi IP
5432 PostgreSQL no expuesto
```

Esto me ayudo a entender mejor la diferencia entre:

- Reglas de entrada
- Reglas de salida
- TCP
- Puertos
- IP publica
- Firewall cloud

## Primer despliegue manual

El primer despliegue fue manual, a proposito.

Flujo:

```text
GitHub -> EC2 Ubuntu -> Docker Compose -> API + PostgreSQL
```

En la EC2 instale Docker y Docker Compose, clone el repositorio desde GitHub, cambie a la rama `pre` y levante la aplicacion:

```bash
docker compose up --build -d
```

Luego valide:

```bash
docker compose ps
curl http://localhost:3000/health
```

Y finalmente probe el endpoint desde fuera usando la IP publica de EC2.

## Aprendizajes clave

Una imagen Docker empaqueta la aplicacion y su entorno.

Un contenedor ejecuta esa imagen.

Docker Compose permite levantar varios servicios juntos.

GitHub Actions sirve para automatizar validaciones.

Un Security Group es un firewall virtual.

SSH usa el puerto 22 y debe estar restringido.

PostgreSQL no debe exponerse publicamente.

Un despliegue manual ayuda a entender que luego automatizara CI/CD.

## Siguiente paso

El siguiente objetivo sera convertir este despliegue manual en un flujo CI/CD:

```text
push a pre  -> deploy a entorno pre
push a prod -> deploy a entorno prod
```

Pero antes queria entender bien cada pieza:

- que se ejecuta
- donde se ejecuta
- que puertos se abren
- como se conecta el servidor
- que riesgos de seguridad existen
- que costes puede generar la infraestructura

Para mi, esa es la parte interesante de aprender DevOps: no solo copiar comandos, sino entender las decisiones detras de cada comando.


# SmartField — Internal Project Map (NO SALE A GIT)
## Ultima actualizacion: 2026-03-22

---

## Estado General del Proyecto

| Area | Estado | Version |
|------|--------|---------|
| Componente (smartfield.js) | Funcional, auditado | v2.7.0 |
| SDK Server (@smartfield-dev/server) | Publicado en npm | v2.7.0 |
| Landing page | Funcional | - |
| Demo + Hacker Challenge | Funcional, 20/20 | - |
| Security Audit | PASADO, 0 bugs | March 22, 2026 |
| License System | IMPLEMENTADO | v2.7.0 |
| React wrapper (sdk/react.tsx) | IMPLEMENTADO | v2.7.0 |
| SRI (Subresource Integrity) | IMPLEMENTADO | - |
| HTTPS Enforcement | IMPLEMENTADO (bug M2) | - |
| Deploy VPS | LIVE | 3wwprotocol.com (temporal) |
| npm publish | LIVE | @smartfield-dev/server |
| Security Modes | IMPLEMENTADO | max, peek, brief |
| Stealth Placeholder | IMPLEMENTADO | sf-stealth |
| Repos separados | HECHO | publico + privado |

---

## REPOSITORIOS — LEE ESTO PRIMERO

### CRITICO: Hay DOS repos separados. NO mezclar.

| Repo | URL | Visibilidad | Contenido |
|------|-----|-------------|-----------|
| **PUBLICO** | github.com/smartfield-dev/smartfield | Publico | Solo componente + SDK + README |
| **PRIVADO** | github.com/eurocomply360/SmartField | Privado | TODO: landing, API, demo, deploy, configs |

### Que va en cada repo:

**PUBLICO (smartfield-dev/smartfield) — lo que ven los devs:**
```
.gitignore
LICENSE
README.md
assets/              (GIFs para el README)
component/
  smartfield.js      (el Web Component)
sdk/
  index.js           (SDK server)
  license.js         (sistema de licencias)
  package.json       (npm package)
  README.md          (docs del SDK)
  go/, java/, php/, python/, ruby/  (SDKs otros lenguajes)
```

**PRIVADO (eurocomply360/SmartField) — todo el proyecto:**
```
Todo lo del publico MAS:
api/                 (servidor Express, endpoints)
landing/             (website, landing page, signup, legal)
demo/                (demo pages, hacker challenge, security modes)
Dockerfile           (Docker config)
docker-compose.yml   (Docker compose)
deploy.sh            (script de deploy al VPS)
ARCHITECTURE.md      (documentacion tecnica)
SECURITY-AUDIT.md    (audit interno)
SECURITY-AUDIT-REPORT.html  (audit Softwebo Security)
INTERNAL-MAP.md      (ESTE ARCHIVO)
smartfield-logo-kit.html
.licenses/           (keys de licencia — NUNCA commitear)
```

### Reglas de oro:
1. **NUNCA subir landing/, api/, demo/, deploy al repo PUBLICO**
2. **NUNCA subir INTERNAL-MAP.md al repo PUBLICO**
3. **NUNCA subir .licenses/ a NINGUN repo**
4. **NUNCA subir .smartfield/ a NINGUN repo**
5. El repo publico tiene remote `origin` → smartfield-dev/smartfield
6. El repo privado tiene remote `private` → eurocomply360/SmartField
7. Para push al publico: `git push origin main`
8. Para push al privado: `git push private main`
9. **Si agregas archivos nuevos**, piensa: "un dev externo necesita ver esto?" Si NO → solo va al privado

### Como hacer push a cada uno:
```bash
# Push al PUBLICO (solo componente + SDK)
git push origin main

# Push al PRIVADO (todo el proyecto)
git push private main

# VERIFICAR que nada privado este en el publico:
gh api repos/smartfield-dev/smartfield/contents --jq '.[].name'
# Debe mostrar SOLO: .gitignore, LICENSE, README.md, assets, component, sdk
```

---

## Servidor / Deploy

### VPS (compartido con InPrices y EuroComply360)
```
IP:       87.106.178.187
SSH:      ssh deploy@87.106.178.187
OS:       Ubuntu
Docker:   Si
```

### IMPORTANTE — NO TOCAR estos proyectos:
- **EuroComply360** → eurocomply360.eu (puerto 3000)
- **InPrices** → inprices.com (puerto 3001, API 8001)
- **PostgreSQL** → eurocomply360-db (puerto 5432)
- **Nginx** → eurocomply360-nginx (puertos 80, 443) — COMPARTIDO

### SmartField en el VPS:
```
Ubicacion:    /home/deploy/smartfield
Container:    smartfield-app
Puerto:       3002 → 3333 (interno)
Red Docker:   eurocomply360_eurocomply-network (para que nginx lo vea)
Volumes:      smartfield-keys (RSA), smartfield-licenses (keys de licencia)
```

### Dominio TEMPORAL:
```
Dominio:      3wwprotocol.com
SSL:          Let's Encrypt (expira 2026-06-20)
Cert path:    /etc/letsencrypt/live/3wwprotocol.com/
Registrar:    Squarespace (DNS A records apuntando a 87.106.178.187)
```

### Dominio REAL (pendiente):
```
Dominio:      smartfield.dev
Estado:       NO COMPRADO / NO CONFIGURADO
Cuando este listo:
  1. Comprar smartfield.dev
  2. Apuntar DNS A records (@ y www) a 87.106.178.187
     (o a la IP del nuevo VPS si ya tiene uno propio)
  3. Obtener SSL: certbot certonly -d smartfield.dev -d www.smartfield.dev
  4. Actualizar nginx.conf: cambiar 3wwprotocol.com → smartfield.dev
  5. Reiniciar nginx: docker restart eurocomply360-nginx
  6. Actualizar README del SDK con la URL real
  7. Actualizar package.json del SDK (homepage)
  8. Publicar nueva version en npm
```

### VPS PROPIO (futuro):
```
Estado:       PENDIENTE
Cuando este listo:
  1. Instalar Docker + nginx en el nuevo VPS
  2. Copiar /home/deploy/smartfield/ al nuevo VPS
  3. docker compose build && docker compose up -d
  4. Configurar nginx con el dominio smartfield.dev
  5. Obtener SSL con certbot
  6. Apuntar DNS a la nueva IP
  7. El codigo NO cambia — solo cambia IP y dominio
```

### URLs LIVE (temporales):
```
https://3wwprotocol.com/landing          # Landing
https://3wwprotocol.com/landing/usecases.html  # Use cases
https://3wwprotocol.com/landing/signup.html    # Signup
https://3wwprotocol.com/demo             # Demo
https://3wwprotocol.com/demo/hacker.html # Hacker challenge
https://3wwprotocol.com/api/health       # Health check
https://3wwprotocol.com/api/public-key   # RSA public key
https://3wwprotocol.com/api/validate     # License validation
https://3wwprotocol.com/api/sri          # SRI hash
```

### Nginx config:
```
Archivo:  /home/deploy/-eurocomply360/nginx/nginx.conf
Backup:   /home/deploy/-eurocomply360/nginx/nginx.conf.backup
Contiene: EuroComply360 + InPrices + SmartField (3 server blocks)
Test:     docker exec eurocomply360-nginx nginx -t
Reload:   docker exec eurocomply360-nginx nginx -s reload
```

### Cómo re-deployar SmartField:
```bash
# Desde tu PC local:
rsync -avz --exclude='node_modules' --exclude='.smartfield' --exclude='.licenses' --exclude='.git' --exclude='INTERNAL-MAP.md' -e ssh /home/kovi/Desktop/SmartField/ deploy@87.106.178.187:/home/deploy/smartfield/

# En el VPS (o via SSH):
ssh deploy@87.106.178.187 "cd /home/deploy/smartfield && docker compose build --no-cache && docker compose up -d && docker image prune -af"
```

### Comandos SEGUROS en el VPS:
```bash
docker logs smartfield-app --tail 50     # Ver logs
docker restart smartfield-app            # Reiniciar
docker compose down                      # Parar (SIN -v!)
docker image prune -af                   # Limpiar imagenes
```

### Comandos PROHIBIDOS en el VPS:
```bash
docker volume prune          # BORRA BASES DE DATOS
docker system prune --volumes # BORRA TODO
docker network prune         # ROMPE CONEXIONES
docker compose down -v       # BORRA VOLUMES
```

---

## Estructura de Archivos (actualizada)

```
/home/kovi/Desktop/SmartField/
│
├── .gitignore                    # Ignora: .smartfield/, node_modules/, *.log, INTERNAL-MAP.md, .licenses/
├── .dockerignore                 # No copia keys ni archivos internos al container
├── Dockerfile                    # Node 18 Alpine, instala deps, copia proyecto
├── docker-compose.yml            # Puerto 3002→3333, red eurocomply360_eurocomply-network
├── deploy.sh                     # Script de deploy al VPS
├── ARCHITECTURE.md               # Documentacion publica del proyecto
├── SECURITY-AUDIT.md             # Audit interno original (March 21)
├── SECURITY-AUDIT-REPORT.html    # Audit corporativo Softwebo Security (March 22) — imprimir como PDF
├── INTERNAL-MAP.md               # ESTE ARCHIVO — mapa interno, NO sale a git
├── smartfield-logo-kit.html      # Logo kit SVG
│
├── component/
│   └── smartfield.js             # Web Component principal
│       - Closed Shadow DOM
│       - AES-256-GCM + RSA-2048
│       - WeakMap storage
│       - License validation (data-key)
│       - Field limiting (free: 3 max)
│       - Badge "Powered by SmartField" (free)
│       - HMAC signature verification
│       - HTTPS enforcement
│       - 20/20 attacks blocked
│       - 0 console.log en produccion
│       - decrypt() REMOVIDO del cliente
│       - Crypto NO expuesto globalmente
│
├── sdk/
│   ├── package.json              # npm: @smartfield-dev/server v2.6.0 (PUBLICADO)
│   ├── index.js                  # SDK principal (decrypt, middleware, init)
│   ├── license.js                # Sistema de licencias
│   │   - generateKey()           → crea sf_live_xxx / sf_test_xxx
│   │   - validateKey()           → valida key + domain + origin
│   │   - revokeKey()             → desactiva una key
│   │   - listKeys()              → lista todas las keys
│   │   - Keys hasheadas con SHA-256 (nunca texto plano)
│   │   - HMAC signing de respuestas
│   │   - Rate limiting por IP
│   │   - Origin header validation
│   │   - Storage en .licenses/keys.json
│   └── README.md                 # Documentacion SDK
│
├── api/
│   ├── package.json              # Express + cors
│   ├── server-sdk.js             # Servidor demo (ESTE SE USA)
│   │   - GET  /api/public-key    → RSA public key
│   │   - GET  /api/health        → status
│   │   - GET  /api/validate      → license validation endpoint
│   │   - GET  /api/sri           → SRI hash del componente
│   │   - POST /api/login         → demo decrypt
│   │   - POST /api/login-normal  → demo plaintext (comparacion)
│   │   - POST /api/generate-key  → generar license key (demo)
│   │   - GET  /api/keys          → listar keys (demo)
│   ├── server.js                 # Servidor original (NO USAR)
│   └── .smartfield/              # Keys RSA (NUNCA commitear)
│       ├── private.json
│       └── public.json
│
├── landing/
│   ├── index.html                # Landing principal
│   ├── usecases.html             # Casos de uso
│   ├── signup.html               # Registro
│   ├── privacy.html              # Privacidad
│   └── terms.html                # Terminos
│
└── demo/
    ├── index.html                # Demo side-by-side
    ├── test.html                 # Test basico
    └── hacker.html               # 20-attack challenge
```

---

## npm

```
Paquete:      @smartfield-dev/server
Version:      2.6.0
URL:          https://www.npmjs.com/package/@smartfield-dev/server
Org:          smartfield-dev
Instalar:     npm install @smartfield-dev/server
Publicar:     cd sdk && npm publish --access public
Nota:         Se necesita token granular de npm con permisos read/write
              El scope real sera @smartfield cuando consigamos el nombre
```

---

## Sistema de Licencias — Como Funciona

### Flujo completo:
```
1. Cliente se registra → se genera sf_live_xxx (hasheada en DB)
2. Cliente pone en su HTML:
   <script src="cdn.smartfield.dev/v1/smartfield.js" data-key="sf_live_xxx"></script>
3. Componente se carga → lee data-key del <script> tag
4. Componente llama: GET /api/validate?key=sf_live_xxx
5. Servidor:
   - Hashea la key recibida
   - Busca el hash en .licenses/keys.json
   - Verifica domain vs Origin header
   - Si ok → firma respuesta con HMAC
   - Rate limit: max 60 req/min por IP
6. Componente recibe respuesta firmada:
   { plan, maxFields, badge, domain, ts, sig }
7. Componente verifica HMAC signature
8. Cachea en sessionStorage (24h)
9. Aplica limites:
   - FREE: 3 campos max, badge visible
   - PRO: unlimited, sin badge
   - ENTERPRISE: unlimited, sin badge, features extra
```

### Seguridad del sistema:
- Keys NUNCA se guardan en texto plano → SHA-256 hash
- Respuestas firmadas con HMAC-SHA256 → no se puede falsificar
- Origin header check → key ligada a dominio
- Rate limiting → previene brute force
- Fallback graceful → si API caida, funciona como free
- HTTPS enforced → en produccion, no acepta HTTP

### Formato de keys:
- `sf_live_` + 32 chars hex = produccion
- `sf_test_` + 32 chars hex = desarrollo (acepta cualquier dominio)

---

## Bugs Resueltos (Audit)

| ID | Severidad | Descripcion | Estado |
|----|-----------|-------------|--------|
| M1 | Medium | Crypto expuesto global | RESUELTO (March 22) |
| M2 | Medium | Sin HTTPS enforcement | RESUELTO (March 22) |
| M3 | Medium | decrypt() en cliente | RESUELTO (March 22) |
| L1 | Low | _fieldId undefined | RESUELTO (pre March 22) |
| L2 | Low | _stopAnim no definido | RESUELTO (pre March 22) |
| L4 | Low | console.log en prod | RESUELTO (March 22) |

---

## Bugs Conocidos / Cosas que corregir para el cliente

| # | Bug | Impacto | Estado |
|---|-----|---------|--------|
| B1 | Test key generada en local no existe en VPS (cada servidor genera su propia) | Cliente pone data-key que no existe en su servidor → cae a free | Documentar: "La key se genera en TU servidor con sf.init(), no la copies de otro entorno" |
| B2 | Mobile: teclado virtual no disparaba keydown | SmartField no aceptaba input en iOS/Android | ARREGLADO: agregado beforeinput event como fallback |
| B3 | sessionStorage cachea licencia free por 24h | Si un dev prueba sin key y luego agrega la key, sigue en free hasta que expire el cache | Documentar: "Limpia sessionStorage.removeItem('sf_license') después de agregar data-key" |
| B4 | Más de 3 SmartFields en una página sin data-key → campos 4+ bloqueados | Demo pages propias necesitan test key | Siempre poner data-key en páginas con más de 3 SmartFields |
| B5 | VPS y local tienen .licenses/ separados → keys no se comparten | Key generada en local no funciona en producción | Documentar: generar keys en el entorno donde se van a usar |
| B6 | nginx default server sirve EuroComply360 si server_name no matchea | Si el cert SSL falla, cae a EuroComply360 | Arreglar: agregar default_server block que devuelva 444 |
| B7 | Responsive mobile básico — grids de 2 columnas no se adaptan bien | Secciones se ven mal en móvil | EN PROGRESO: agregado media queries básicas |
| B10 | React/Next.js: re-render destruye SmartFields creados con useEffect/dangerouslySetInnerHTML | SmartField desaparece o se vacía cuando React actualiza state | RESUELTO v2.7.0: (1) Componente: añadidos métodos públicos getRealValue(), hasValue(), clear() non-enumerable. (2) React wrapper (sdk/react.tsx): usa customElements.whenDefined() para evitar race condition con defer script, mountedRef para Strict Mode double-mount, Map externo para tracking de valores via sf-input events, getSmartFieldValue() con 3 fallbacks (getRealValue → _s → event store). Probado con InPrices (Next.js 16 + React 19). |
| B8 | sf-stealth no oculta placeholder en HTML source — solo en el browser (JS) | Un bot que lee HTML raw ve placeholder="password" y sabe qué campo es | Documentar: con sf-stealth usar placeholders genéricos ("..." o vacío) y depender del label. Considerar: encriptar placeholder en server-side render |
| B9 | Placeholders descriptivos en la landing exponen tipo de campo en HTML | "password", "email", "card number" visibles en view-source | Cambiar a placeholders genéricos en todos los SmartFields con sf-stealth |

---

## TODO (actualizado)

### HECHO
- [x] Web Component funcional
- [x] Encryption AES-256 + RSA-2048
- [x] 20/20 hack attacks blocked
- [x] Security audit PASADO (Softwebo Security)
- [x] License key system (data-key + validation + HMAC)
- [x] Audit report corporativo (Softwebo Security)
- [x] npm publish @smartfield-dev/server v2.7.1
- [x] SRI (Subresource Integrity) — endpoint /api/sri
- [x] HTTPS enforcement en key fetch (bug M2)
- [x] Deploy a VPS (3wwprotocol.com temporal)
- [x] SSL/HTTPS con Let's Encrypt
- [x] Docker + nginx configurado
- [x] React/Next.js wrapper (sdk/react.tsx) — bug B10 resuelto
- [x] Public API: getRealValue(), hasValue(), clear()
- [x] Security modes: max, peek, brief
- [x] Primer cliente free: InPrices (inprices.com/login)
- [x] Docs: compliance (PCI-DSS, HIPAA, GDPR, SOX)
- [x] Docs: React wrapper, security modes, API reference, events
- [x] 2FA configurado en npm

### PENDIENTE — LANZAMIENTO
- [ ] Comprar dominio smartfield.dev
- [ ] VPS propio para SmartField (no compartido)
- [ ] CDN: Cloudflare o unpkg (gratis, ya funciona con npm)
- [ ] Hacker News launch post
- [ ] Product Hunt launch
- [ ] Reddit /r/webdev + /r/netsec posts
- [ ] Dev.to artículo
- [ ] Mobile testing completo

### PENDIENTE — FEATURES
- [ ] Stripe payment integration
- [ ] Google OAuth (signup "Continue with Google")
- [ ] Dashboard (analytics) — feature grande, post-launch
- [ ] sf-type="message" (textarea encriptado)
- [ ] SDKs nativos: Python (pip), PHP (composer), Java (maven), Go (module)

### PENDIENTE — CUANDO LLEGUE CLIENTE ENTERPRISE

Estos items NO los necesitas ahora. Solo cuando un cliente enterprise diga "nos interesa".
Cada item tiene un trigger: la señal de que ya es momento de hacerlo.

**Infraestructura:**
- [ ] VPS dedicado con SLA 99.9% (AWS/GCP) — Trigger: cliente pide uptime SLA
- [ ] CDN enterprise (Cloudflare Pro $20/mes o AWS CloudFront) — Trigger: tráfico >100K req/día
- [ ] Monitoring 24/7 (Better Stack, PagerDuty) — Trigger: cliente pide incident response SLA
- [ ] Redundancia multi-región — Trigger: cliente pide disaster recovery plan

**Seguridad formal:**
- [ ] Pentest por firma reconocida (Cure53, NCC Group, Trail of Bits) — Trigger: cliente pide third-party audit. Costo: $15K-30K
- [ ] SOC 2 Type II certificación — Trigger: cliente enterprise lo exige en procurement. Costo: $10K-50K con Vanta/Drata
- [ ] ISO 27001 — Trigger: cliente europeo enterprise lo pide. Costo: $15K-40K
- [ ] Bug bounty program (HackerOne/Bugcrowd) — Trigger: quieres seguridad continua. Costo: pagas por bug encontrado

**Legal / Compliance:**
- [ ] Términos de servicio enterprise (con SLA, indemnización, liability cap) — Trigger: legal del cliente lo pide
- [ ] DPA (Data Processing Agreement) para GDPR — Trigger: cliente europeo lo pide
- [ ] BAA (Business Associate Agreement) para HIPAA — Trigger: cliente healthcare lo pide. NOTA: SmartField nunca toca PHI, pero algunos clientes lo piden de todos modos
- [ ] Seguro de cyber liability — Trigger: contrato enterprise >$50K/año. Costo: $1K-5K/año
- [ ] Política de seguridad escrita (incident response, access control, etc.) — Trigger: SOC 2 o cliente lo pide

**Documentación enterprise:**
- [x] Compliance guides en docs (PCI-DSS, HIPAA, GDPR, SOX) — HECHO
- [ ] Whitepaper técnico (PDF descargable) — Trigger: equipo de seguridad del cliente quiere evaluar
- [ ] Architecture diagram formal — Trigger: review de seguridad del cliente
- [ ] Penetration test report público (redacted) — Trigger: después del pentest formal

**Ventas enterprise:**
- [ ] Demo environment dedicado (no compartido con la landing) — Trigger: demo call con enterprise
- [ ] Pricing enterprise custom (no publicar precio, "Contact Sales") — Trigger: primeras conversaciones enterprise
- [ ] Contrato anual con descuento — Trigger: cliente quiere commitment
- [ ] Soporte dedicado (Slack channel, email SLA <4h) — Trigger: cliente paga >$1K/mes

**Costos estimados para estar "enterprise ready":**
| Item | Costo | Cuándo |
|------|-------|--------|
| VPS dedicado | $50-200/mes | Con primeros 10 clientes pro |
| Dominio smartfield.dev | $12/año | Ya |
| CDN Cloudflare | $0-20/mes | Ya (gratis tier) |
| Pentest formal | $15K-30K | Cuando revenue >$5K/mes |
| SOC 2 | $10K-50K | Cuando enterprise lo pida |
| Bug bounty | Variable | Cuando revenue >$3K/mes |
| Seguro cyber | $1K-5K/año | Con primer contrato enterprise |
| Total para empezar | ~$100/mes | Dominio + VPS + Cloudflare |
| Total enterprise ready | ~$30K-80K one-time | Solo cuando haya revenue |

---

## Comandos Utiles

```bash
# === LOCAL ===
# Arrancar servidor local
cd /home/kovi/Desktop/SmartField/api && node server-sdk.js

# URLs locales
http://localhost:3333/landing
http://localhost:3333/demo
http://localhost:3333/api/health

# === VPS ===
# Conectar al VPS
ssh deploy@87.106.178.187

# Ver logs de SmartField
ssh deploy@87.106.178.187 "docker logs smartfield-app --tail 50"

# Re-deployar
rsync -avz --exclude='node_modules' --exclude='.smartfield' --exclude='.licenses' --exclude='.git' --exclude='INTERNAL-MAP.md' -e ssh /home/kovi/Desktop/SmartField/ deploy@87.106.178.187:/home/deploy/smartfield/
ssh deploy@87.106.178.187 "cd /home/deploy/smartfield && docker compose build --no-cache && docker compose up -d && docker image prune -af"

# Verificar que todo funciona
ssh deploy@87.106.178.187 "curl -s http://localhost:3002/api/health"

# Ver todos los containers
ssh deploy@87.106.178.187 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# Generar license key (en el VPS)
ssh deploy@87.106.178.187 "docker exec smartfield-app node -e \"const lic = require('/app/sdk/license'); lic.init(); console.log(lic.generateKey({ domain: 'example.com', plan: 'pro' }))\""

# === NPM ===
# Publicar nueva version
cd /home/kovi/Desktop/SmartField/sdk
# Actualizar version en package.json
npm publish --access public
```

---

## Notas Importantes

1. **server-sdk.js** es el servidor, NO server.js
2. Keys RSA en `.smartfield/` — NUNCA commitear
3. Keys de licencia en `.licenses/` — NUNCA commitear
4. `INTERNAL-MAP.md` — NUNCA commitear (esta en .gitignore)
5. WeakMap es el corazon de la seguridad — todo dato sensible va ahi
6. `_s()` helper accede al WeakMap — definido con Object.defineProperty
7. setTimeout(100ms) en constructor para leer atributos
8. El componente se carga desde `/component/smartfield.js`
9. **3wwprotocol.com es TEMPORAL** — dominio real sera smartfield.dev
10. **VPS es COMPARTIDO** — no tocar InPrices ni EuroComply360
11. **Nginx es compartido** — el config tiene 3 bloques (EuroComply + InPrices + SmartField)
12. sdk/index.js usa `require('crypto').webcrypto.subtle` (no `globalThis.crypto`) para compatibilidad con Node 18 Alpine

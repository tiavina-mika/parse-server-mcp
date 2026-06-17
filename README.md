# parse-server-mcp

Serveur MCP (Model Context Protocol) exposant les operations d'un backend Parse Server (CRUD, schemas, queries avec pointers) a des clients MCP (Claude CLI/Desktop, Cursor, ...).

Voir [MCP_PARSE_SERVER_GUIDE.md](MCP_PARSE_SERVER_GUIDE.md) pour la conception detaillee et [CLAUDE.md](CLAUDE.md) pour les regles de code du projet.

## Installation

```bash
npm install
npm run build
```

## Configuration

Variables d'environnement (voir section 10 du guide) :

| Variable | Obligatoire | Description |
|---|---|---|
| `PARSE_SERVER_URL` | oui | ex: `https://api.example.com/parse` |
| `PARSE_APP_ID` | oui | App ID Parse |
| `PARSE_MASTER_KEY` | recommande | necessaire pour `GET /schemas` et bypass des ACL/CLP |
| `PARSE_JAVASCRIPT_KEY` / `PARSE_REST_API_KEY` | optionnel | alternative a la master key |
| `PORT` | non (defaut 3939) | port du serveur HTTP |
| `MCP_AUTH_TOKEN` | recommande en mode HTTP | protege l'endpoint `/mcp` |
| `SNAPSHOT_DIR` | non (defaut `./snapshots`) | dossier de sortie des `.md`/`.json`/`.csv` |
| `SNAPSHOT_ENABLED` | non (defaut `true`) | active/desactive les snapshots |
| `ALLOW_NEW_FIELDS` | non (defaut `false`) | autorise les champs hors schema sur create/update |
| `TYPES_DIR` | non (defaut `./types`) | dossier de sortie des `.types.ts` generes |
| `MCP_TRANSPORT` | non (defaut `stdio`) | `stdio` ou `http`, surcharge par le flag `--transport` |

## Lancement

En stdio (cas recommande, un process par projet lance par le client MCP) :

```bash
parse-server-mcp --transport stdio
```

En HTTP (acces distant/partage) :

```bash
parse-server-mcp --transport http --port 3939
```

## Enregistrement dans Claude CLI

```bash
claude mcp add parse-monprojet --transport stdio \
  --env PARSE_SERVER_URL=https://api.example.com/parse \
  --env PARSE_APP_ID=myAppId \
  --env PARSE_MASTER_KEY=myMasterKey \
  -- parse-server-mcp --transport stdio
```

## Tools disponibles

- `parse_list_schemas`, `parse_get_schema`
- `parse_find`, `parse_get`, `parse_create`, `parse_update`, `parse_delete`
- `parse_list_snapshots`
- `parse_snapshot_query`, `parse_diff_query_snapshots`
- `parse_generate_types`

## Developpement

```bash
npm run dev         # build en watch mode
npm run typecheck   # verification des types
npm test            # tests unitaires (vitest)
npm run lint        # eslint
```

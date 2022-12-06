# How to use this repository

First, create the site and the schema:

```
./create-site.ts
../../neolace-app/neolace-api/neolace-admin.ts sync-schema openalex < schema.yaml
```

Then, to import everything, run:

```
./openalex-import.ts all
```

Or for a more selective import, run something like:

```
./openalex-import.ts --no-download --last-date 2022-09-22 authors
```

which will import all authors from files starting with 2022-09-23, and which will skip the download step.

If you need to reset it:

```
../../neolace-app/neolace-api/neolace-admin.ts erase-content openalex --skip-prompt-and-dangerously-delete
```


## Prod site instructions

```
source .../environments/prod/neolace-admin.sh
./openalex-import.ts concepts
./openalex-import.ts institutions
```
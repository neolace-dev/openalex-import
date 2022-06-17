# How to use this repository

```
./create-site.ts
../../neolace-app/neolace-api/neolace-admin.ts sync-schema openalex < schema.yaml
./openalex-import.ts
```

If you need to reset it: 
```
../../neolace-app/neolace-api/neolace-admin.ts erase-content openalex --skip-prompt-and-dangerously-delete
```

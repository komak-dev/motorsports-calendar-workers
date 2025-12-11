#!/bin/bash

cd $(dirname "$0")/schemas
rm -f ../src/types/schemas/*.ts
pwd
for f in *.schema.json; do
  out="../src/types/schemas/$(basename $f .schema.json).ts"
  npx json-schema-to-typescript "$f" -o "$out"
done
cd -
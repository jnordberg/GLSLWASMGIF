
SHELL := /bin/bash
PATH  := ./node_modules/.bin:$(PATH)

.PHONY: preview
preview: node_modules
	wintersmith preview

.PHONY: build
build: node_modules
	wintersmith build
	uglifyjs build/main.js \
		--source-map "content=inline,url=main.js.map,filename=build/main.js.map" \
		--compress "dead_code,collapse_vars,reduce_vars" \
		-o build/main.js
	uglifyjs build/glslEditor.js \
		--source-map "content=inline,url=glslEditor.js.map,filename=build/glslEditor.js.map" \
		--compress "dead_code,collapse_vars,reduce_vars" \
		-o build/glslEditor.js

node_modules:
	npm install

.PHONY: clean
clean:
	rm -rf build

.PHONY: distclean
distclean: clean
	rm -rf node_modules

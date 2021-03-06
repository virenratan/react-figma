# Figma to React Converter

Using the Figma REST API to convert a Figma document to React Components.

## API Usage

Two endpoints are used in this project:

* `GET /v1/files/:file_key` - Get the JSON tree from a file. This is the main workhorse of this project and lays the skeleton of the React Components.
* `GET /v1/images/:file_key` - When we identify nodes that are vectors or other nodes that can't directly be represented by `div`s, we have to render them as svgs.

## Set up

1.  Install [Node](https://nodejs.org/). You'll need a recent version that supports `async / await`
2.  In this directory, run `yarn`
3.  Run the converter per instructions below

## Usage

When we run the converter, we will convert any _top level frames_ in the document to React Components _as long as their name starts with `#`_.
In the example document you can see that we have one top level frame named `#Clock`. The component resulting from this will be exported in
`src/figmaComponents.js` as `MasterClock`, a `React.PureComponent`.

In addition, _any_ node with a name starting with a `#` will have a code stub generated for it in `src/components`. These code stubs can be
modified to affect the rendering of those components as well as modifying variables within the component (see variables section below).

To run the converter on a file, you will need a personal access token from Figma. Refer to the [Figma API documentation](https://www.figma.com/developers/docs)
for more information on how to obtain a token. The other piece of information you will need is the file key of the file you wish to convert.

```
yarn start <FILE_KEY> <API_TOKEN_HERE>
```

where `<API_TOKEN_HERE>` would be replaced with your developer token.

You can also change the .env file and insert your token there

```
//.env
DEV_TOKEN=<YOUR_TOKEN>
```

then you only need to pass the file key.

```
yarn start <FILE_KEY>
```

## Variables

The real vision of this converter is to separate design concerns from coding concerns. Toward this end, we introduce the concept of
`variables` in Figma. Variables in a Figma file are denoted by text nodes (this can be expanded in the future) with names starting with
`$`. In the example document there are three variables: `$time`, `$seconds`, and `$ampm`. By setting state in the component stubs defined in
`src/components`, we can _change the text of the variable nodes_. For an example, take a look at `src/components/CClock.js`. This
allows us to change the design of a component without touching the code at all.

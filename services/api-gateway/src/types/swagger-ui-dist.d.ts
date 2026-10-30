// swagger-ui-dist ships no type declarations; the gateway only needs the assets folder.
declare module 'swagger-ui-dist' {
  const swaggerUiDist: { getAbsoluteFSPath(): string };
  export default swaggerUiDist;
}

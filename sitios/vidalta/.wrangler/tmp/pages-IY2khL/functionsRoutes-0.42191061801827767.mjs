import { onRequest as __api___path___js_onRequest } from "/home/claude/laboptimiza/sitios/vidalta/functions/api/[[path]].js"

export const routes = [
    {
      routePath: "/api/:path*",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api___path___js_onRequest],
    },
  ]
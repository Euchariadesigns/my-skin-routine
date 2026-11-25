/*
 * Cloudflare Pages serves the app at my-skin-routine.pages.dev.
 * Calls to /api/* are passed to the reminder server (the my-skin-routine Worker, see worker/index.ts)
 * through a service binding named API, set up in the Pages project's settings.
 */
interface Env {
  API?: { fetch(request: Request): Promise<Response> }
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.API) {
    return new Response(JSON.stringify({ error: 'The reminder server isn’t connected yet' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
  return env.API.fetch(request)
}

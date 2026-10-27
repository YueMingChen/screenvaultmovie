export default {
  async fetch() {
    return Response.json({ pong: true, runtime: 'vercel', route: '/api/ping' });
  },
};

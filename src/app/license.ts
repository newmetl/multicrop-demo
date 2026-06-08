/**
 * CE.SDK license + user id. The license is read from Vite's build-time env
 * (`VITE_CESDK_LICENSE`); when absent the engines run unlicensed (trial
 * watermark) and the demo still works. The value flows in via `import.meta.env`
 * (typed through tsconfig's `"types": ["vite/client"]`) — the `.env` file is
 * never read by app code.
 */
export const CESDK_LICENSE = import.meta.env.VITE_CESDK_LICENSE as
  | string
  | undefined;

/** Shared CE.SDK user id, passed to both engines. */
export const CESDK_USER_ID = 'multicrop-demo-user';

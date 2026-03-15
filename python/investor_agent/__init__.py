import warnings

warnings.warn(
    "\n\n"
    "investor-agent v1.x (Python) is DEPRECATED.\n"
    "v2.0 is a complete rewrite on Cloudflare Workers (TypeScript).\n"
    "The PyPI package will not receive further updates.\n\n"
    "For migration instructions, see:\n"
    "https://github.com/ferdousbhai/investor-agent\n",
    DeprecationWarning,
    stacklevel=2,
)

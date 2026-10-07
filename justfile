set positional-arguments
set quiet

# Start loopback CodexBar, Token Pulse, and Cloudflare tunnel TUNNEL. Do not publish port 8080.
[default]
@up tunnel="myusage":
    bash "{{ justfile_directory() }}/scripts/up.sh" "$1"

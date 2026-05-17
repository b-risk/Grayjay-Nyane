# Grayjay Nyane

This plugin adds support for [Nyane](https://nyane.online), allowing you to use it in Grayjay.

## Installation
You can install the plugin by scanning this QR code:  
![QR Code](https://raw.githubusercontent.com/b-risk/Grayjay-Nyane/refs/heads/main/Imgs/qr-code.png)

Alternatively, you can add it manually by using this link:

```
grayjay://plugin/https://raw.githubusercontent.com/b-risk/Grayjay-Nyane/refs/heads/main/NyaneConfig.json
```

## Features

- [x] MP4 Video playback and metadata if available (some videos on the site have less metadata)
- [x] Channel support (each archive is a channel)
- [x] Channel page with video listings, avatar, banner
- [x] Homepage results (first channel's videos)
- [x] Video searches across all channels
- [x] Channel searches

## Signing

```
# Generate keypair
ssh-keygen -t rsa -b 2048 -m PEM -f ./private-key.pem

# Encode it in Base64 and set the environment variable
export SIGNING_PRIVATE_KEY="$(base64 -w 0 ./private-key.pem)"

# Run the sign script:
sh ./sign-script.sh ./NyaneScript.js ./NyaneConfig.json
```

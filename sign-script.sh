#!/bin/bash
# Generate keypair
# ssh-keygen -t rsa -b 2048 -m PEM -f ./private-key.pem
#
# Encode it in Base64 and set the environment variable
# export SIGNING_PRIVATE_KEY="$(base64 -w 0 ./private-key.pem)"
#
# Run the sign script:
# sh ./sign-script.sh "{SCRIPT_FILE_PATH}" "{CONFIG_FILE_PATH}"

if [ -z "$SIGNING_PRIVATE_KEY" ]; then
    echo "Error: SIGNING_PRIVATE_KEY environment variable not set"
    echo ""
    echo "Generate a keypair first:"
    echo "  ssh-keygen -t rsa -b 2048 -m PEM -f ./private-key.pem"
    echo "  export SIGNING_PRIVATE_KEY=\"\$(base64 -w 0 ./private-key.pem)\""
    exit 1
fi

SCRIPT_FILE="$1"
CONFIG_FILE="$2"

if [ -z "$SCRIPT_FILE" ] || [ -z "$CONFIG_FILE" ]; then
    echo "Usage: $0 <script-file> <config-file>"
    exit 1
fi

# Create signature
SIGNATURE=$(echo -n "$(cat "$SCRIPT_FILE")" | openssl dgst -sha256 -sign <(echo "$SIGNING_PRIVATE_KEY" | base64 -d) | base64 -w 0)
PUBLIC_KEY=$(echo "$SIGNING_PRIVATE_KEY" | base64 -d | openssl rsa -pubout 2>/dev/null | base64 -w 0)

# Update config with signature
TMP_FILE=$(mktemp)
node -e "
const config = require('fs').readFileSync('$CONFIG_FILE', 'utf8');
const json = JSON.parse(config);
json.scriptSignature = '$SIGNATURE';
json.scriptPublicKey = '$PUBLIC_KEY';
require('fs').writeFileSync('$CONFIG_FILE', JSON.stringify(json, null, 2) + '\n');
"

echo "Script signed successfully!"

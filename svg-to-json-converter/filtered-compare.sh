#!/bin/bash

# Smart compare with filtering of STRING DIFF lines
# Usage: ./filtered-compare.sh <js-file.json> <perl-file.json>

if [ $# -ne 2 ]; then
    echo "Usage: $0 <js-file.json> <perl-file.json>"
    exit 1
fi

echo "🔍 Smart JSON Comparison (filtering out STRING DIFF issues)"
echo "📁 JS file: $1"
echo "📁 Perl file: $2"
echo ""

# Run smart-compare and filter out STRING DIFF lines while preserving line structure
node smart-compare.js "$1" "$2" | grep -v "❌ STRING DIFF"

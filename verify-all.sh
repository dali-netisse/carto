#!/bin/bash

echo "🚀 Comprehensive JS vs Perl Output Verification"
echo "=============================================="

cd /home/dali/netisse/carto

# Function to test a single file
test_file() {
    local file_base="$1"
    echo ""
    echo "📋 Testing: $file_base"
    echo "----------------------------------------"
    
    if [ -f "js-output/${file_base}.json" ] && [ -f "pl-output/${file_base}.json" ]; then
        node svg-to-json-converter/smart-compare.js "js-output/${file_base}.json" "pl-output/${file_base}.json"
    else
        echo "❌ Missing files for $file_base"
        [ ! -f "js-output/${file_base}.json" ] && echo "   Missing: js-output/${file_base}.json"
        [ ! -f "pl-output/${file_base}.json" ] && echo "   Missing: pl-output/${file_base}.json"
    fi
}

# Test all available files
echo "🔍 Finding available test files..."
available_files=$(ls pl-output/*.json 2>/dev/null | sed 's|pl-output/||g' | sed 's|\.json$||g' | sort)

if [ -z "$available_files" ]; then
    echo "❌ No Perl output files found in pl-output/"
    exit 1
fi

echo "📁 Found files: $(echo $available_files | tr '\n' ' ')"

# Test each file
for file_base in $available_files; do
    test_file "$file_base"
done

echo ""
echo "🏁 Comprehensive verification completed!"
echo ""
echo "📋 Summary:"
echo "   - If you see '✅ PERFECT MATCH!' for all files, the JS implementation is functionally identical to Perl"
echo "   - Any differences shown are meaningful (not just tiny floating-point precision)"
echo "   - Float tolerance: 1e-10 (much larger than the ~1e-14 precision differences we expect)"

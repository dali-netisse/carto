#!/usr/bin/env perl

use strict;
use warnings;
use JSON;
use Math::Trig;

# Post-process JSON files to exactly match Perl's JSON encoding behavior
# This eliminates tiny floating-point precision differences between JS and Perl

sub process_value {
    my $value = shift;
    
    if (ref($value) eq 'HASH') {
        return process_hash($value);
    } elsif (ref($value) eq 'ARRAY') {
        return process_array($value);
    } elsif (looks_like_number($value)) {
        # Let Perl re-encode the number exactly as it would naturally
        # This eliminates tiny JavaScript vs Perl floating-point differences
        return $value + 0.0;  # Force numeric context and Perl's precision
    } else {
        return $value;
    }
}

sub process_hash {
    my $hash = shift;
    my $result = {};
    
    for my $key (keys %$hash) {
        $result->{$key} = process_value($hash->{$key});
    }
    
    return $result;
}

sub process_array {
    my $array = shift;
    my @result;
    
    for my $item (@$array) {
        push @result, process_value($item);
    }
    
    return \@result;
}

sub looks_like_number {
    my $value = shift;
    return defined($value) && $value =~ /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
}

# Main processing
if (@ARGV != 2) {
    die "Usage: $0 <input.json> <output.json>\n";
}

my ($input_file, $output_file) = @ARGV;

# Read the input JSON
open my $fh, '<', $input_file or die "Cannot open $input_file: $!";
my $json_text = do { local $/; <$fh> };
close $fh;

# Parse JSON
my $json = JSON->new->allow_nonref;
my $data = $json->decode($json_text);

# Process the data with Perl's natural number handling
my $processed_data = process_value($data);

# Output with exactly the same JSON formatting as the original Perl script
my $output_json = JSON->new->pretty->space_before(1)->canonical->encode($processed_data);

# Write the output
open my $out_fh, '>', $output_file or die "Cannot open $output_file: $!";
print $out_fh $output_json;
close $out_fh;

print "JSON file processed with Perl precision: $input_file -> $output_file\n";

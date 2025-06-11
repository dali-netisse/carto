#!env -S perl -w

use strict;
use warnings;
use File::Monitor;
use Data::Dumper;
use JSON;

my %dirs =
(
	#"laposte-map-data/src/BRU"	=> { dests => ["v2","v3"] },
	"laposte-map-data/src/BRU"	=> { dests => ["v3"] },
	#"laposte-map-data/src/CRO"	=> { dests => ["v2","v3"] },
	"laposte-map-data/src/LYS"	=> { dests => ["v3"] },
	##"laposte-map-data/src/LY1"	=> { dests => ["v3"], merge => 1 },
	##"laposte-map-data/src/LY2"	=> { dests => ["v3"], merge => 1 },
	"laposte-map-data/src/STR"	=> { dests => ["v3"] },
	"laposte-map-data/src/*-*"	=> { dests => ["v3"] },
	"mapdata-*/src"			=> { dests => ["v3"] },
);

my $reverse = "\x1b[7;32m";
my $normal = "\x1b[m";

my $change_detected;

sub do_actions
{
	my $filename = shift;
	my $actions = shift;

	return if $filename =~ /^\./;
	return if $filename !~ /\.svg$/i;
	$change_detected = 1;
	print STDERR "${reverse}   =====   Processing ${filename}${normal}   =====   \n";
	for my $dest (@{$actions->{dests}})
	{
		system(qq[bash -c 'map-converter/svg-to-json-converter.pl -d "pl-output" "$filename"']);
	}
	print STDERR "\n\n";
}

my $monitor = File::Monitor->new();

sub monitor_file
{
	my $filename = shift;
	my $actions = shift;

	return if $filename =~ /^\./;
	return if $filename !~ /\.svg$/i;

	do_actions($filename,$actions);

	print STDERR "monitoring $filename\n";
	$monitor->watch( {
		name        => $filename,
		callback    => {
			change => sub {
				my ($name, $event, $change) = @_;
				# Do stuff
				do_actions($filename,$actions);
			}
		}
	} );
}

sub monitor_dir
{
	my $dirname = shift;
	my $actions = shift;

	return if ! -d $dirname;
	return if $dirname =~ /^\./;
	print STDERR "monitoring $dirname\n";

	$monitor->watch( {
		name        => $dirname,
		#files       => 1,
		callback    => {
			files_created => sub {
				my ($name, $event, $change) = @_;
				print STDERR "files created:".Dumper($name,$event,$change->{delta})."\n";
				# Do stuff
				monitor_dir_or_file($_,$actions) for @{$change->{delta}{files_created}};
			}
		}
	} );

	opendir my $dh,$dirname or warn "can't open $dirname $!";
	while (my $filename = readdir $dh)
	{
		next if $filename =~ /^\./;
		monitor_dir_or_file("$dirname/$filename", $actions);
	}
}

sub monitor_dir_or_file
{
	my $name = shift;
	my $actions = shift;

	if (-d $name)
	{
		monitor_dir($name, $actions);
	}
	else
	{
		monitor_file($name, $actions);
	}

}

for my $dir (keys %dirs)
{
	my $actions = $dirs{$dir};
	for (glob $dir)
	{
		monitor_dir_or_file($_, $actions);
	}
}

# while (1)
# {
# 	$change_detected = 0;
# 	$monitor->scan;
# 	if ($change_detected)
# 	{
# 		open my $fh,">borne-v3/public/version.json" or die "can't open version.json: $!";
# 		print $fh to_json({version => time});
# 		close $fh;
# 	}
# 	sleep 1;
# }

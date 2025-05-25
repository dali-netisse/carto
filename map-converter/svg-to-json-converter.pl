#!/usr/bin/env -S perl -w

use XML::LibXML;
use JSON;
use strict;
use utf8;
use Unicode::Normalize;
use Math::Trig;
use Getopt::Std;
use File::Basename;

=pod

Ce script sert à convertir des fichiers SVG éditables avec AI ou Inkscape en fichiers JSON qui peuvent être consommés par nos libraires d'affichage de cartes.

En particulier:
- il gère des plans avec des coordonnées différentes à l'aide du rectangle calage
- il "applatit" les transforms pour n'avoir que des objets avec des coordonnées directement utilisables
- il nettoie une partie des points superflus sur les polygones
- il essaie de simplifier certains types d'objets
- il élimine certains objets inutiles
- il essaie d'identifier et de retraiter les différents types d'objets

=cut

binmode STDOUT,":utf8";
binmode STDERR,":utf8";

my $options = {};
getopts("d:s:",$options);

my $reverse = "\x1b[7;31m";
my $normal = "\x1b[m";

for my $filename (@ARGV)
{
	my $site;
	my $floor;
	print STDERR "$filename\n";
	# The directory which contains the SVG files and salles-name-to-id
	my $dir = dirname($filename);
	# The directory which contains site mappings
	my $sites_map_filename = $dir."/../sites-map";
	my %sites;

	if (open my $sites_map_fh, $sites_map_filename)
	{
		binmode $sites_map_fh,":utf8";
		while (<$sites_map_fh>)
		{
			chomp;
			s/\s*#.*$//;
			s/^\s*//;
			next if !$_;
			my ($name, $id)=	split /\t/;
			if (!$id && /^[^ ]+ [^ ]+$/)
			{
				print STDERR "${reverse}Warning: sites-map uses space as separator${normal}\n";
				($name, $id)=	split / /;
			}
			$name	=~	s/(^\s+|\s+$)//g;
			$id	=~	s/(^\s+|\s+$)//g;
			$name	=	lc NFD($name);
			$name	=~	s/\pM//g;
			$name	=~	s/\W+/_/g;
			$sites{$name} = $id;
		}
		close $sites_map_fh;
		#print STDERR Dumper({sites => \%sites});
	}

	my $dest_dir = $options->{d} // ($dir."/../../data");
	if ($filename =~ /(?:^|[\/\\])([-\w\s]+?\d*)(?:\s|-)(?:R\+(\d+)|R(-\d+)|(RDC|E[01]?|M|P\d*))\.svg$/i)
	{
		$floor = $2 // $3 // $4;
		$floor= 0 if $floor eq "RDC";
		if ($options->{s})
		{
			$site = $options->{s};
		}
		else
		{
			my $fullsite	=	lc NFD($1);
			$fullsite	=~	s/\pM//g;
			$fullsite	=~	s/[-\s]+/_/g;
			if ($fullsite =~ /^(\w+)_(\d+)(?:_|$)/)
			{
				my $eds = $2;
				$site = $sites{$1};
				$site =~ s/\$1/$eds/g;
			}
			else
			{
				$site = $sites{$fullsite};
			}
			die "Can't match site $fullsite!" if !$site;
		}
	}
	else
	{
		die "Can't match filename $filename!";
	}

	my $meeting_rooms_map_filename = $dir."/salles-name-to-id";
	my %meeting_rooms_map = ();
	if (open my $meeting_rooms_map_fh, $meeting_rooms_map_filename)
	{	#or die "can't open $meeting_rooms_map_filename: $!";
		binmode $meeting_rooms_map_fh,":utf8";
		while (<$meeting_rooms_map_fh>)
		{
			chomp;
			s/\s*#.*$//;
			s/^\s*//;
			next if !$_;
			my ($name, $id) = split /\t/;
			$name	=~	s/(^\s+|\s+$)//g;
			$id	=~	s/(^\s+|\s+$)//g;
			$name	=	lc NFD($name);
			$name	=~	s/\pM//g;
			$name	=~	s/\W//g;
			$meeting_rooms_map{$name} = $id;
		}
		close $meeting_rooms_map_fh;
	}
	#print Dumper(\%meeting_rooms_map);

	# Rectangle de calage pour un des étages au choix, les autres seront alignés sur celui-là
	# XXX il faudrait trouver un moyen de ne pas les préciser ici
	# - si on traite tous les étages d'un coup il suffirait de prendre le premier
	# - on pourrait utiliser un rectangle arbitraire genre 0,0 1000,1000 mais problème de ratio L/H
	# - conséquences sur la viewbox et autres coordonnées à l'extérieur du JSON généré (points de départ, ascenseurs...)
	# XXX La Poste-specific
	my %calage=
	(
		"BRU" => [90.811, 173.738, 1079.809, 791.261],
		"CRO" => [278.098, 486.193, 473.095, 413.773],
		"LYS" => [114, 140, 1032.5, 412.5],
		"LY1" => [114, 140, 1032.5, 412.5],
		"LY2" => [0.4, 191.5, 841.2, 808.1],
		"MOR-MON" => [32.6, 43.5, 831.7, 322.8],
		"670-FON" => [82.389702, 147.50954, 32.499454, 68.240524],
		#"330-BOR" => [82.389702, 147.50954, 32.499454, 68.240524],
		"330-BOR" => [82.020836,146.84375,76.729156, 95.25],
		"VER-LON" => [82.389702, 147.50954, 32.499454, 68.240524],
		"VER-PAR" => [82.389702, 147.50954, 32.499454, 68.240524],
		"VER-SIN" => [82.389702, 147.50954, 32.499454, 68.240524],
		"VER-LUX" => [82.389702, 147.50954, 32.499454, 68.240524],
		"VER-TUN-BIWA" => [82.389702, 147.50954, 32.499454, 68.240524],
		"AXE-TUN" => [82.389702, 147.50954, 32.499454, 68.240524],
		"DOC-PAR-SVH" => [82.389702, 147.50954, 32.499454, 68.240524],
		"DOC-PAR-SKL" => [82.389702, 147.50954, 32.499454, 68.240524],
		"DOC-SOF-ARC" => [82.389702, 147.50954, 32.499454, 53.240524],
		"DOC-AR24" => [82.389702, 147.50954, 32.499454, 53.240524],
		#"PCA-SLV" => [82.389702, 147.50954, 32.499454, 53.240524],
		"FLO-BOR" => [-21.069839, 131.63164, 147.15504, 58.516472],
		"IFP-PAR-RAP" => [ -75.40625, 132.29167, 199.76042, 58.208328, ],
		"CRNS-BOIXGUI-AGRI" => [-21.069839, 131.63164, 147.15504, 58.516472],
		"CRNS-EVR-ROCH" => [-21.069839, 131.63164, 147.15504, 58.516472],
		"340-MON" => [90.811, 173.738, 1079.809, 791.261],
		"761-ROU" => [90.811, 173.738, 1079.809, 791.261],
	);
	my ($nx, $ny, $nw, $nh);
	if ($calage{$site})
	{
		($nx, $ny, $nw, $nh) = @{$calage{$site}};
	}
	else
	{
		warn "Manque infos de calage pour $site";
	}
	print STDERR "$site-$floor\n";
	# XXX à ne pas mettre en dur!
	#my $output_filename = "/Users/jacquescaron/geoloc/t/public/borne/public/data/$site-$floor.json";
	#my $output_filename = "../geoloc/geoloc/www/data/$site-$floor.json";
	my $output_filename = "$dest_dir/$site-$floor.json";
	print "Saving to $output_filename\n";
	my $parser = XML::LibXML->new(load_ext_dtd => 0, huge => 1);
	my $svg = $parser->load_xml(location=>$filename) or die "couldn't load $filename: $!";
	my $xpc = XML::LibXML::XPathContext->new;
	$xpc->registerNs('svg', 'http://www.w3.org/2000/svg');

	my $data	=	{};

	my %attrs_per_type=
	(
		rect		=>	[qw(x y width height)],
		polygon		=>	["points"],
		path		=>	["d"],
		line		=>	[qw(x1 x2 y1 y2)],
		polyline	=>	 ["points"],
	);
	my $global_transform;

	sub transform_point
	{
		my $x		=	shift;
		my $y		=	shift;
		my $transform	=	shift;

		#die if !defined $x;
		return [
			$x * $transform->[0] + $y * $transform->[2] + $transform->[4],
			$x * $transform->[1] + $y * $transform->[3] + $transform->[5],
		];
	}
	sub add_point
	{
		my $command = shift;
		my $x = shift;
		my $y = shift;
		my $transform = shift;
		my $newpath_ref = shift;
		my $is_polygon_ref = shift;
		my $polygon_points_ref = shift;
		my $force_add_firstpoint = shift;

		my $point = join(",",@{transform_point($x,$y,$transform)});
		$$newpath_ref .= $command.$point;
		if ($$is_polygon_ref)
		{
			if ($command =~ /^[lL]$/ || (!scalar @$polygon_points_ref && $command =~ /^[mM]$/))
			{
				if ($force_add_firstpoint || !scalar @$polygon_points_ref || $point ne $$polygon_points_ref[0])
				{
					push @$polygon_points_ref, $point;
				}
			}
			else
			{
				$$is_polygon_ref = 0;
			}
		}
	}
	sub transform_node
	{
		my $node	=	shift;
		my $transform	=	shift;
		my $mode	=	shift;

		return if !$transform;
		#return if $transform->[0] == 1 && !$transform->[1] && !$transform->[2] && $transform->[3] == 1 && !$transform->[4] && !$transform->[5];

		my $type	=	lc $node->nodeName();
		if ($type eq "rect")
		{
			my ($x, $y, $w, $h) = map { $node->getAttribute($_) } qw(x y width height);
			if (!$transform->[1] && !$transform->[2])
			{
				# If only translation and/or scaling, a rect is still a rect
				my $p1 = transform_point($x, $y, $transform);
				my $p2 = transform_point($x + $w, $y + $h, $transform);
				#use Data::Dumper;
				#print STDERR Dumper([$x, $y, $w, $h], $transform, $p1,$p2);
				my ($nw, $nh) = ($p2->[0] - $p1->[0], $p2->[1] - $p1->[1]);
				$node->setAttribute("x", $p1->[0]);
				$node->setAttribute("y", $p1->[1]);
				$node->setAttribute("width", $nw);
				$node->setAttribute("height", $nh);
			}
			else
			{
				# Otherwise, it becomes a polygon
				$node->setNodeName("polygon");
				$node->removeAttribute($_) for qw(x y width height);
				my @points = ();
				push @points, transform_point($x, $y, $transform);
				push @points, transform_point($x + $w, $y, $transform);
				push @points, transform_point($x + $w, $y + $h, $transform);
				push @points, transform_point($x, $y + $h, $transform);
				$node->setAttribute("points",join(" ",map { join(",",@$_) } @points));
				#print STDERR $node->toString();
			}
		}
		elsif ($type eq "line")
		{
			my ($x1, $y1, $x2, $y2) = map { $node->getAttribute($_) } qw(x1 y1 x2 y2);
			my $p1 = transform_point($x1, $y1, $transform);
			my $p2 = transform_point($x2, $y2, $transform);
			#use Data::Dumper;
			#print STDERR Dumper([$x, $y, $w, $h], $transform, $p1,$p2);
			$node->setAttribute("x1", $p1->[0]);
			$node->setAttribute("y1", $p1->[1]);
			$node->setAttribute("x2", $p2->[0]);
			$node->setAttribute("y2", $p2->[1]);
		}
		elsif ($type eq "polygon" || $type eq "polyline")
		{
			#my $points = " ".$node->getAttribute("points")." ";
			my $points = $node->getAttribute("points");
			#print "$points\n";
			$points =~ s/(^\s+|\s+$)//g;
			$points =~ s/\s+/ /g;
			#$points =~ s/(?<= )(-?\d*(?:\.\d+)?) +(-?\d*(?:\.\d+)?)(?= )/$1,$2/g;
			$points =~ s/(?:^|(?<= ))(-?\d*(?:\.\d+)?) +(-?\d*(?:\.\d+)?)(?:$|(?= ))/$1,$2/g;
			#print STDERR "$points\n";
			my @points = map { transform_point($_->[0], $_->[1], $transform); } map { [ split /,/,$_ ] } split /\s+/,$points;
			#print STDERR Dumper($transform,\@points);
			$node->setAttribute("points",join(" ",map {join(",",@$_)} @points));
		}
		elsif ($type eq "path")
		{
			my $path = $node->getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "original-d") || $node->getAttribute("d");
			my $oldpath = $path;
			my $newpath = "";
			my $command = "";
			my $x;
			my $y;
			my $startx;
			my $starty;
			my $is_polygon = 1;
			my @polygon_points = ();
			#print STDERR "transform: ".Dumper($transform);
			#print STDERR "old path: ".$path."\n";

			while ($path)
			{
				#print STDERR "> $path\n";
				if ($path =~ s/^\s*([mMlLhHvVcCsSqQtTaAzZ])\s*//)
				{
					$command = $1;
				}
				elsif ($path =~ s/^[ ,]*//)
				{
				}
				# Otherwise it's the same command and the previous one
				if ($command =~ /^[lmt]$/ && $path =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$x += $1;
					$y += $2;
					add_point(uc($command), $x, $y, $transform, \$newpath, \$is_polygon, \@polygon_points);
					if ($command eq "m")
					{
						$startx = $x;
						$starty = $y;
						$command = "l";
					}
				}
				elsif ($command =~ /^[LMT]$/ && $path =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,| |(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$x = $1;
					$y = $2;
					add_point(uc($command), $x, $y, $transform, \$newpath, \$is_polygon, \@polygon_points);
					if ($command eq "M")
					{
						$startx = $x;
						$starty = $y;
						$command = "L";
					}
				}
				elsif ($command eq "h" && $path =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$x += $1;
					add_point('L', $x, $y, $transform, \$newpath, \$is_polygon, \@polygon_points);
				}
				elsif ($command eq "H" && $path =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$x = $1;
					add_point('L', $x, $y, $transform, \$newpath, \$is_polygon, \@polygon_points);
				}
				elsif ($command eq "v" && $path =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$y += $1;
					add_point('L', $x, $y, $transform, \$newpath, \$is_polygon, \@polygon_points);
				}
				elsif ($command eq "V" && $path =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$y = $1;
					add_point('L', $x, $y, $transform, \$newpath, \$is_polygon, \@polygon_points);
				}
				elsif ($command =~ /^[zZ]$/)
				{
					$x = $startx;
					$y = $starty;
					if ($mode && $mode eq "itinerary")
					{
						#print STDERR "closing itinerary for ".$node->getAttribute("id")."\n";
						add_point('L', $x, $y, $transform, \$newpath, \$is_polygon, \@polygon_points, 1);
					}
					else
					{
						$newpath .= 'Z';
					}
				}
				elsif ($command eq "c" && $path =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,| |(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,| |(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					#print STDERR "c -> $1 / $2 / $3 / $4 / $5 / $6\n";
					$is_polygon = 0;
					$newpath .= 'C'.join(",",@{transform_point($x+$1,$y+$2,$transform)},@{transform_point($x+$3,$y+$4,$transform)},@{transform_point($x+$5,$y+$6,$transform)});
					$x += $5;
					$y += $6;
				}
				elsif ($command eq "C" && $path =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_polygon = 0;
					$newpath .= 'C'.join(",",@{transform_point($1,$2,$transform)},@{transform_point($3,$4,$transform)},@{transform_point($5,$6,$transform)});
					$x = $5;
					$y = $6;
				}
				elsif ($command =~ /^[sq]$/ && $path =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_polygon = 0;
					$newpath .= uc($command).join(",",@{transform_point($x+$1,$y+$2,$transform)},@{transform_point($x+$3,$y+$4,$transform)});
					$x += $3;
					$y += $4;
				}
				elsif ($command =~ /^[SQ]$/ && $path =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_polygon = 0;
					$newpath .= uc($command).join(",",@{transform_point($1,$2,$transform)},@{transform_point($3,$4,$transform)});
					$x = $3;
					$y = $4;
				}
				elsif ($command eq "a" && $path =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_polygon = 0;
					# XXX we should really change rx, ry, and x-axis-rotation
					$newpath .= 'A'.join(",",$1,$2,$3,$4,$5,@{transform_point($x+$6,$y+$7,$transform)});
					$x += $6;
					$y += $7;
				}
				elsif ($command eq "A" && $path =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_polygon = 0;
					# XXX we should really change rx, ry, and x-axis-rotation
					$newpath .= 'A'.join(",",$1,$2,$3,$4,$5,@{transform_point($x+$6,$y+$7,$transform)});
					$x = $6;
					$y = $7;
				}
				else
				{
					die "Could not match $path for command $command in $oldpath";
				}
			}
			#print STDERR "new path: ".$newpath."\n";
			if ($is_polygon)
			{
				$node->setNodeName(($mode && $mode eq "itinerary")?"polyline":"polygon");
				#print STDERR "Converting ".$node->getAttribute("id")." from path $oldpath to ".$node->nodeName()." ".join(" ",@polygon_points)."\n";
				$node->setAttribute("points",join(" ",@polygon_points));
				$node->removeAttribute("d");
			}
			else
			{
				$node->setAttribute("d", $newpath);
			}
		}
		else
		{
			warn "transform for type $type not supported";
		}
	}
	sub polygon_perimeter
	{
		my $points = shift;
		my $length = 0;

		for my $i (0 .. $#$points)
		{
			my $v1 = $points->[$i];
			my $v2 = $points->[($i+1) % scalar(@$points)];
			my $dx = $v2->[0] - $v1->[0];
			my $dy = $v2->[1] - $v1->[1];
			$length += sqrt($dx * $dx + $dy * $dy);
		}
		return $length;
	}
	sub polygon_area
	{
		my $points = shift;
		my $area = 0;

		for my $i (0 .. $#$points)
		{
			my $v1 = $points->[$i];
			my $v2 = $points->[($i+1) % scalar(@$points)];
			$area += $v1->[0] * $v2->[1] - $v2->[0] * $v1->[1];
		}
		return abs $area / 2;
	}
	sub svg_node_to_json
	{
		my $node	=	shift;
		my $mode	=	shift;

		#print STDERR $node->toString();
		my $element	=	$node;
		while ($element->nodeType != XML_DOCUMENT_NODE)
		{
			my $transform	=	$element->getAttribute("transform");
			if ($transform)
			{
				if ($transform =~ /^matrix\(([-0-9e. ,]+)\)$/)
				{
					my @matrix	=	split /[ ,]+/,$1;
					if (scalar(@matrix) != 6)
					{
						die "unsupported transform matrix $1";
					}
					transform_node($node,\@matrix,$mode);
				}
				elsif ($transform =~ /^translate\s*\(\s*(-?\d*(?:\.\d*)?)(?:[, ]+(-?\d*(?:\.\d*)?))?\s*\)\s*$/)
				{
					my $matrix = [ 1, 0, 0, 1, $1, $2 // 0 ];
					#print STDERR Dumper($transform,$matrix);
					transform_node($node,$matrix,$mode);
				}
				elsif ($transform =~ /^scale\s*\(\s*(-?\d*(?:\.\d*)?)\s*\)\s*$/)
				{
					my $matrix = [ $1, 0, 0, $2 // $1, 0, 0 ];
					#print STDERR Dumper($transform,$matrix);
					transform_node($node,$matrix,$mode);
				}
				elsif ($transform =~ /^rotate\s*\(\s*(-?\d*(?:\.\d*)?)\s*\)\s*$/)
				{
					my $angle = $1 * pi / 180;
					my $cos = cos($angle);
					my $sin = sin($angle);
					my $matrix = [ $cos, $sin, -$sin, $cos, 0, 0 ];
					#print STDERR Dumper($transform,$matrix);
					transform_node($node,$matrix,$mode);
				}
				elsif ($transform =~ /^\s*rotate\s*\(\s*(-?\d*(?:\.\d*)?)[, ]+(-?\d*(?:\.\d*)?)[, ]+(-?\d*(?:\.\d*)?)\s*\)\s*$/)
				{
					# rotate about a given center, equivalent to translate, rotate, translate back
					my $angle = $1 * pi / 180;
					my $x = $2;
					my $y = $3;
					my $matrix_translate1 = [ 1, 0, 0, 1, -$x, -$y ];
					my $matrix_translate2 = [ 1, 0, 0, 1, $x, $y ];
					#print STDERR Dumper($transform,$matrix_translate);
					my $cos = cos($angle);
					my $sin = sin($angle);
					my $matrix_rotate = [ $cos, $sin, -$sin, $cos, 0, 0 ];
					#print STDERR Dumper($transform,$matrix_rotate);
					# XXX it would probably be more efficient to multiply the matrices instead?
					transform_node($node,$matrix_translate1,$mode);
					transform_node($node,$matrix_rotate,$mode);
					transform_node($node,$matrix_translate2,$mode);
				}
				elsif ($transform =~ /^translate\s*\(\s*(-?\d*(?:\.\d*)?)[, ]+(-?\d*(?:\.\d*)?)\s*\)\s*rotate\s*\(\s*(-?\d*(?:\.\d*)?)\s*\)\s*$/)
				{
					# XXX we should really handle any combination
					my $x = $1;
					my $y = $2;
					my $angle = $3 * pi / 180;
					my $matrix_translate = [ 1, 0, 0, 1, $x, $y ];
					#print STDERR Dumper($transform,$matrix_translate);
					my $cos = cos($angle);
					my $sin = sin($angle);
					my $matrix_rotate = [ $cos, $sin, -$sin, $cos, 0, 0 ];
					#print STDERR Dumper($transform,$matrix_rotate);
					transform_node($node,$matrix_rotate,$mode);
					transform_node($node,$matrix_translate,$mode);
				}
				else
				{
					die $reverse."unsupported transform $transform".$normal;
				}
			}
			$element = $element->parentNode();
		}
		my $type	=	lc $node->nodeName();
		# Remove points that are too close together. Usually not useful, and they often break the insetting
		if ($type eq "polygon" || $type eq "polyline")
		{
			my $points = $node->getAttribute("points");
			#print STDERR "points before: $points\n";
			$points =~ s/\s+/ /g;
			$points =~ s/(^\s+|\s+$)//g;
			$points =~ s/(?:^|(?<= ))(-?\d*(?:\.\d+)?) +(-?\d*(?:\.\d+)?)(?:$|(?= ))/$1,$2/g;
			#print STDERR "points after: >$points<\n";
			my $last;
			my $threshold = 0.4;
			my @points = grep { my $ret = (!$last || abs($last->[0]-$_->[0]) > $threshold || abs($last->[1]-$_->[1]) > $threshold ) ? $_ : (); $last = $_; $ret } map { [ split /,/,$_ ] } split /\s+/,$points;
			if (scalar(@points) >= 2 && $type eq "polygon" && !($mode && $mode eq "itinerary"))
			{
				$last = $points[$#points];
				my $first = $points[0];
				if (abs($last->[0] - $first->[0]) <= $threshold && abs($last->[1] - $first->[1]) <= $threshold)
				{
					pop @points;
				}
			}
			if ($mode && ($mode eq "itinerary" || $mode eq "furniture"))
			{
				if (scalar(@points) < 2)
				{
					print STDERR "Skipping ".$node->toString.": single point or less\n";
					return ();
				}
			}
			else
			{
				if (scalar(@points) <= 2)
				{
					print STDERR "Skipping ".$node->toString.": 2 points or less\n";
					return ();
				}
				my $area = polygon_area(\@points);
				my $perimeter = polygon_perimeter(\@points);
				my $ratio = $area / $perimeter;
				if ($ratio < 0.2)
				{
					print STDERR "Skipping ".$node->toString.": area $area perimeter $perimeter -> ratio $ratio\n";
					return ();
				}
			}
			if ($mode && $mode eq "itinerary" && $type eq "polygon")
			{
				$node->setNodeName("polyline");
				push @points, $points[0];
			}
			$node->setAttribute("points",join(" ",map {join(",",@$_)} @points));
		}
		if ($type eq "path")
		{
			my $path = $node->getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "original-d") || $node->getAttribute("d");
			if ($path =~ /^[mM]\s*(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)$/)
			{
				# Path with a single point, ignore
				print STDERR "Skipping ".$node->toString().": single point\n";
				return ();
			}
		}
		if ($global_transform)
		{
			transform_node($node,$global_transform,$mode);
			if (0)
			{
				#print STDERR $node->toString()."\n";
				if ($type eq "rect")
				{
					my ($x, $y, $w, $h) = map { $node->getAttribute($_) } qw(x y width height);
					my $p1 = transform_point($x, $y, $global_transform);
					my $p2 = transform_point($x + $w, $y + $h, $global_transform);
					#use Data::Dumper;
					#print STDERR Dumper([$x, $y, $w, $h], $global_transform, $p1,$p2);
					my ($nw, $nh) = ($p2->[0] - $p1->[0], $p2->[1] - $p1->[1]);
					$node->setAttribute("x", $p1->[0]);
					$node->setAttribute("y", $p1->[1]);
					$node->setAttribute("width", $nw);
					$node->setAttribute("height", $nh);
				}
				elsif ($type eq "line")
				{
					my ($x1, $y1, $x2, $y2) = map { $node->getAttribute($_) } qw(x1 y1 x2 y2);
					my $p1 = transform_point($x1, $y1, $global_transform);
					my $p2 = transform_point($x2, $y2, $global_transform);
					#use Data::Dumper;
					#print STDERR Dumper([$x, $y, $w, $h], $global_transform, $p1,$p2);
					$node->setAttribute("x1", $p1->[0]);
					$node->setAttribute("y1", $p1->[1]);
					$node->setAttribute("x2", $p2->[0]);
					$node->setAttribute("y2", $p2->[1]);
				}
				elsif ($type eq "polygon" || $type eq "polyline")
				{
					my $points = $node->getAttribute("points");
					$points =~ s/(^\s+|\s+$)//g;
					my @points = map { transform_point($_->[0], $_->[1], $global_transform); } map { [ split /,/,$_ ] } split /\s+/,$points;
					$node->setAttribute("points",join(" ",map {join(",",@$_)} @points));
				}
				#print STDERR $node->toString()."\n";
			}
		}
		# Type may have changed
		$type	=	lc $node->nodeName();
		if ($type eq "polygon" && $mode && $mode eq "itinerary")
		{
			$node->setNodeName("polyline");
			$type = "polyline";
		}
		return {
			type =>	$type,
			map
			{
				my $a = $_;
				my $v = $node->getAttribute($a) // "";
				if (!defined $v || $v eq "")
				{
					();
				}
				else
				{
					$v =~ s/\s+/ /g;
					$v =~ s/(^ | $)//g;
					if ($a =~ /^(x|y|width|height|x1|x2|y1|y2)$/)
					{
						$v = $v + 0;
					}
					($a, $v);
				}
			} ("id","name","class","showBubble","bubbleSide","offsetX","offsetY","scale",@{$attrs_per_type{$type}} ),
		}
	}

	my @calage_rect = $xpc->findnodes('(//svg:g[@id="Calage" or @inkscape:label="Calage"]//svg:rect|//svg:rect[@id="Calage"])', $svg);
	if (@calage_rect == 1 && defined $nx && defined $ny && defined $nw && defined $nh)
	{
		my $rect = $calage_rect[0];
		svg_node_to_json($rect);
		print Dumper({calage => $rect});
		my $x1 = +$rect->getAttribute("x");
		my $y1 = +$rect->getAttribute("y");
		my $width = +$rect->getAttribute("width");
		my $height = +$rect->getAttribute("height");
		my $x2 = $x1 + $width;
		my $y2 = $y1 + $height;
		print STDERR "calage in: ".join(",",$x1, $y1, $width, $height)."\n";
		my $a = $nw / ($x2 - $x1);
		my $d = $nh / ($y2 - $y1);
		$global_transform = [
			$a,
			0,
			0,
			$d,
			$nx - $x1 * $a,
			$ny - $y1 * $d,
		];
	}
	elsif (0 && $site eq "PCA-DRA" && $floor eq "0")
	{
		my $angle = 40;
		my $scale = 1.05;
		warn "Rotating $angle°";
		my $rad = $angle * pi / 180;
		$global_transform = [ $scale * cos $rad, $scale * sin $rad, -$scale * sin $rad, $scale * cos $rad, 215, 65 ];
	}
	elsif ($site eq "PCA-00372" && $floor eq "1")
	{
		warn "Rotating 90°";
		$global_transform = [ 0, 1, -1, 0, 0, 0 ];
	}
	elsif ($site eq "PCA-00709" && $floor eq "1")
	{
		warn "Rotating 90°";
		$global_transform = [ 0, -1, 1, 0, -200, 100 ];
	}
	elsif ($site eq "PCA-00391" && $floor eq "3")
	{
		warn "Scaling";
		my $scale = 2;
		$global_transform = [ $scale, 0, 0, $scale, 0, 0 ];
	}
	elsif ($site eq "VER-TUN-NEU")
	{
		warn "Scaling";
		my $scale = 0.3;
		$global_transform = [ $scale, 0, 0, $scale, 0, 0 ];
	}
	elsif ($site eq "IFP-PAR-RAP" && $floor eq "14")
	{
		warn "Translating";
		my $scale = 1;
		$global_transform = [ $scale, 0, 0, $scale, -20, 15 ];
	}
	elsif ($site eq "IFP-PAR-RAP" && $floor eq "15")
	{
		warn "Translating";
		my $scale = 1;
		$global_transform = [ $scale, 0, 0, $scale, -20, 15 ];
	}
	else
	{
		warn "Calage not found";
		$global_transform = [ 1, 0, 0, 1, 0, 0 ];
	}
	use Data::Dumper;
	print STDERR Dumper($global_transform);

	#my @background_nodes = $xpc->findnodes('//*[@id="Contour_1_"]', $svg);
	my @background_nodes = $xpc->findnodes('//svg:g[@id="Contour" or @inkscape:label="Contour"]//*[self::svg:rect or self::svg:path or self::svg:polygon]', $svg);
	#print STDERR $_->toString()."\n" for @background_nodes;
	$data->{background}=[map {svg_node_to_json($_)} @background_nodes];

	my @decor_nodes = $xpc->findnodes('//svg:g[@id="Decor" or @inkscape:label="Decor"]//*[self::svg:rect or self::svg:path or self::svg:polygon]', $svg);
	$data->{decor}=[map {svg_node_to_json($_)} @decor_nodes];

	my @itineraries = $xpc->findnodes('//svg:g[@id="Lignes_de_couloir" or @inkscape:label="Lignes de couloir"]//*[self::svg:line or self::svg:polyline or self::svg:polygon or self::svg:path]', $svg);
	if (0)
	{
		if ($site eq "CRO" && $floor eq "1")
		{
			@itineraries = grep { ! defined $_->getAttribute("stroke-width") } @itineraries;
		}
		for my $itinerary (@itineraries)
		{
			#<line xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#0ECC76" x1="835.32" y1="316.486" x2="858.385" y2="286.244"/>
			print STDERR $itinerary->toString()."\n";
			if ($site eq "CRO" && $floor eq "1" && $itinerary->nodeName() eq 'line' && $itinerary->getAttribute("x1") eq "835.32")
			{
				$itinerary->setAttribute("x1", $itinerary->getAttribute("x1") + 8);
				$itinerary->setAttribute("y1", $itinerary->getAttribute("y1") - 8);
				$itinerary->setAttribute("x2", $itinerary->getAttribute("x2") + 8);
				$itinerary->setAttribute("y2", $itinerary->getAttribute("y2") - 8);
			}
		}
	}
	$data->{itineraries}=[map {delete $_->{"class"}; svg_node_to_json($_,"itinerary")} @itineraries];

	my @nodes = $xpc->findnodes('//svg:g[@id="Salles" or @id="Pièces" or @id="pièces" or @inkscape:label="Salles" or @inkscape:label="Pièces" or @inkscape:label="pièces"]//*', $svg);
	print STDERR "Found ".scalar(@nodes)." elements\n";

	$data->{pois}	=	{};
	#$data->{pois}	=	[];

	my %ids;
	# XXX Toutes les corrections ici devraient être réintégrées dans les SVG
	my %id_fixes=
	(
		"LYS-3" =>
		{
			AP335_1	=> "AP355",
		},
		"BRU-7" =>
		{
			"Salle_de_réunion_des_Territoires" => "Salle_de_réunion_Salle_des_territoires",
			"Ascenseur" => "Ascenseur_x-left",
			"Sanitaires_1" => "Sanitaires_1_x-offsetX_10_x-offsetY_25",
			"Ascenseurs" => "Ascenseurs_x-left_x-offsetY_25",
			"Ascenseurs_3" => "Ascenseurs_3_x-offsetY_25",
			"Sanitaires_2" => "Sanitaires_2_x-left_x-offsetX_-10_x-offsetY_25",
			"Escalier_2" => "Escalier_2_x-left_x-offsetX_5_x-offsetY_15",
		},
		"BRU-6" =>
		{
			"Ascenseur" => "Ascenseur_x-left",
			"Sanitaires_1" => "Sanitaires_1_x-offsetX_10_x-offsetY_25",
			"Ascenseurs_3" => "Ascenseurs_x-left_x-offsetY_25",
			"Ascenseurs" => "Ascenseurs_3_x-offsetY_25",
			"Sanitaires_2" => "Sanitaires_2_x-left_x-offsetX_-10_x-offsetY_25",
			"Escalier_2" => "Escalier_2_x-left_x-offsetX_5_x-offsetY_15",
		},
		"BRU-5" =>
		{
			"Ascenseur" => "Ascenseur_x-left",
			"Sanitaires_1" => "Sanitaires_1_x-offsetX_10_x-offsetY_25",
			"Ascenseurs" => "Ascenseurs_x-left_x-offsetY_25",
			"Ascenseurs_3" => "Ascenseurs_3_x-offsetY_25",
			"Sanitaires_2" => "Sanitaires_2_x-left_x-offsetX_-10_x-offsetY_25",
			"Escalier_2" => "Escalier_2_x-left_x-offsetX_5_x-offsetY_15",
			"Escalier_4" => "Bureau_C507",
		},
		"BRU-4" =>
		{
			"Ascenseur" => "Ascenseur_x-left",
			"Sanitaires_1" => "Sanitaires_1_x-offsetX_10_x-offsetY_25",
			"Ascenseurs" => "Ascenseurs_x-left_x-offsetY_25",
			"Ascenseurs_3" => "Ascenseurs_3_x-offsetY_25",
			"Sanitaires_2" => "Sanitaires_2_x-left_x-offsetX_-10_x-offsetY_25",
			"Escalier_2" => "Escalier_2_x-left_x-offsetX_5_x-offsetY_15",
			"Salle_de_réunion_Zaïre" => "Salle_de_réunion_Loire",
		},
		"BRU-2" =>
		{
			"Ascenseur" => "Ascenseur_x-left",
			"Sanitaires_1" => "Sanitaires_1_x-offsetX_10_x-offsetY_25",
			"Ascenseurs" => "Ascenseurs_x-left_x-offsetY_25",
			"Ascenseurs_3" => "Ascenseurs_3_x-offsetY_25",
			"Sanitaires_2" => "Sanitaires_2_x-left_x-offsetX_-10_x-offsetY_25",
			"Escalier_2" => "Escalier_2_x-left_x-offsetX_5_x-offsetY_15",
			"Sanitaires" => "Sanitaires_x-left_x-offsetX_-10",
			#"Hérault" => "Herault",
		},
		"CRO-6" =>
		{
			"Ascenseur" => "Ascenseur_x-left",
			"Ascenseur_1" => "Ascenseur_1_x-left",
			"Salle_de_réunion_Luxembourg" => "Salle_de_réunion_S6_Luxembourg",
			"Salle_de_réunion_Odéon" => "Salle_de_réunion_S6_Odéon",
			"Salle_de_réunion_Mabillon" => "Salle_de_réunion_S6_Mabillon",
			"Salle_de_réunion_Mazarine" => "Salle_de_réunion_S6_Mazarine",
			"Salle_de_réunion_Furstenberg" => "Salle_de_réunion_G6_Furstenberg",
			"Salle_de_réunion_Rennes" => "Salle_de_réunion_G6_Rennes",
			"Salle_du_conseil_6G-28" => "Salle_de_réunion_G6_Salle_du_conseil",
			"Digilab_6S-17_-_6S-45" => "Service_Digilab",
		},
		"CRO-5" =>
		{
			"Salle_de_réunion_Jussieu" => "Salle_de_réunion_G5_Jussieu",
			"Salle_de_réunion_Panthéon" => "Salle_de_réunion_G5_Panthéon",
			"Salle_de_réunion_Tournelle" => "Salle_de_réunion_S5_Tournelle",
			"Salle_de_réunion_Contreescarpe" => "Salle_de_réunion_S5_Contrescarpe",
			"Salle_de_réunion_Monge_5S-74_5S-80" => "Salle_de_réunion_S5_Monge",
			"salle_de_réunion_Cluny_5G-20_-_5G-26" => "Salle_de_réunion_S5_Cluny",
			"Ascenseur" => "Ascenseur_x-left",
			"Ascenseur_1" => "Ascenseur_1_x-left",
		},
		"CRO-4" =>
		{
			"Bureau_4G-62_4G-58_1" => "Bureau_4G-62_-_4G-58",
			"Tisannerie_1" => "Tisannerie",
			"Salle_de_réunion_Henri_IV_1" => "Salle_de_réunion_S4_Henri_IV",
			"Salle_de_réunion_Vosges_1" => "Salle_de_réunion_S4_Vosges",
			"Salle_de_réunion_Cités_4S-24_1" => "Salle_de_réunion_S4_Cité",
			"Salle_de_réunion_Notre_Dame_1" => "Salle_de_réunion_G4_Notre_Dame",
			"Salle_de_réunion_Célestins_1" => "Salle_de_réunion_G4_Célestins",
			"Ascenseur_2" => "Ascenseur_2_x-left",
			"Ascenseur_3" => "Ascenseur_3_x-left",
		},
		"CRO-2" =>
		{
			"Salle_de_réunion_Bourse" => "Salle_de_réunion_S2_Bourse",
			"Salle_de_réunion_Choiseul_2S-19" => "Salle_de_réunion_S2_Choiseul",
			"Salle_de_réunion_Sentier_2S-22_2S-24" => "Salle_de_réunion_S2_Sentier",
			"Salle_de_réunion_Quatre_Septembre_2S-28" => "Service_Service_Logistique",
			"Bureau_2S-15_Atelier_IT" => "Service_Atelier_IT",
			"Salle_de_réunion_Petits_Champs_2G-88" => "Salle_de_réunion_G2_Petits_Champs",
			"Salle_de_réunion_Victoires" => "Salle_de_réunion_S2_Victoires_x-left",
			"Ascenseur" => "Ascenseur_x-left",
			"Ascenseur_1" => "Ascenseur_1_x-left",
		},
		"CRO-0" =>
		{
			#"0G Cafétaria" => "0G Cafétéria",
			"Bureau_0G-058_1" => "Service Espace CE",
			"Bureau_0G-014" => "Service Espace Courrier",
			"Escalier_4" => "Escalier_4_x-left",
			"Ascenseur_2" => "Ascenseur_2_x-left",
			"Sanitaires:_H_x2F_F_x2F_PMR" => "Sanitaires_x-offsetX_-30_x-offsetY_-30",
		},
		"CRO-1" =>
		{
			"Salle_de_réunon_1S_Rivoli" => "Salle_de_réunion_1S_Rivoli",
			"Sallle_de_réunion_1G_Concorde" => "Salle_de_réunion_1G_Concorde",
			"Salle_de_réunion_1S_Salle_de_créativité" => "Salle_de_réunion_1S_Salle_de_créativité_x-left",
			"Salle_de_réunion_1S_Pyramides" => "Salle_de_réunion_1S_Pyramides_x-left",
			"Salle_de_réunion_1S_Louvre" => "Salle_de_réunion_1S_Louvre_x-left",
			"Escalier_3" => "Escalier_3_x-left",
			"Ascenseur_1" => "Ascenseur_1_x-left",
		},
		"CRO-3" =>
		{
			"Salle_de_réunion_3S_Turenne" => "Salle_de_réunion_3S_Turenne_x-left",
			"Escalier_2" => "Escalier_2_x-left",
			"Ascenseur_3" => "Ascenseur_3_x-left",
		},
	);
	my %other_fixes =
	(
		#"CRO-1" =>
		#{
		#	"Salle_de_réunion_1S_Salle_de_créativité" =>
		#	{
		#		points => '762.318,219.853 669.071,152.23 682.306,270.146 729.806,265.309 762.785,220.191',
		#	}
		#},
	);
	my $id_fixes_site = $id_fixes{"$site-$floor"};
	use Data::Dumper;
	print STDERR Dumper($id_fixes_site);
	for my $node (@nodes)
	{
		# Get id from node
		my $name;
		my $id = $node->getAttribute("id");
		next if !$id;
		my $data_name = $node->getAttribute("data-name");
		if ($data_name)
		{
			my $data_name2 = $data_name;
			$data_name2 =~ s/[, ]+/_/g;
			if ($data_name2 eq $id)
			{
				$id = $data_name;
			}
		}
		my $label = $node->getAttributeNS("http://www.inkscape.org/namespaces/inkscape","label");
		if ($label && $label =~ /^override\s+(.*)$/i)
		{
			$id = $1;
		}
		elsif ($label && $id =~ /^path[-_\s\d]+$/)
		{
			$id = $label;
		}
		$id =~ s/_$//;
		print STDERR "$id\n";
		my $other_fixes = $other_fixes{"$site-$floor"}{$id};
		if ($other_fixes)
		{
			for my $attr (keys %$other_fixes)
			{
				$node->setAttribute($attr, $other_fixes->{$attr});
			}
		}
		if ($id_fixes_site && $id_fixes_site->{$id})
		{
			print STDERR " -> $id_fixes_site->{$id}\n";
			$id = $id_fixes_site->{$id};
		}
		$id =~ s/_x([0-9a-f]{2})_/sprintf("%c", hex($1))/egi;
		#$id =~ s/_1_?$//;
		$id =~ s/_/ /g;
		if (exists $ids{$id})
		{
			print STDERR "Duplicate id $id\n";
		}
		$ids{$id}	=	undef;

		if ($id =~ s/ +x-(left|tl|tr|bl|br)//)
		{
			print STDERR "Found bubbleSide: $1\n";
			$node->setAttribute("bubbleSide",$1);
		}
		while ($id =~ s/ +x-(offset[XY]|scale) (-?\d+(?:\.\d+)?)//i)
		{
			print STDERR "Found $1: $2\n";
			$node->setAttribute($1,$2);
		}
		my $class;
		if ($id =~ /^Terrasse.*/i)
		{
			$class	=	"terrace";
		}
		elsif ($id =~ /^Bureaux? (.*)$/i)
		{
			$class	=	"office";
			$id	=	$1;
			$id	=~	s/ 1 ?$//g;
			$id	=~	s/ +- +/,/g;
			$id	=~	s/ +et +/,/g;
			$id	=~	s/([0-6][GS])-([0-9]+)/$1$2/g;
			#$id	=~	s/-/,/g;
			$id	=~	s/ //g;
		}
		elsif ($id =~ /^Openspaces? (.*)$/i)
		{
			$class	=	"openspace";
			$id	=	$1;
			$id	=~	s/ 1 ?$//g;
			$id	=~	s/ +- +/,/g;
			$id	=~	s/ +et +/,/g;
			$id	=~	s/([0-6][GS])-([0-9]+)/$1$2/g;
			#$id	=~	s/-/,/g;
			$id	=~	s/ //g;
		}
		elsif ($id =~ /^Bureau ([A-Z]) ?($floor[0-9]{2})$/i)
		{
			$class	=	"office";
			$id	=	$1.$2;
		}
		elsif ($id =~ /^Bureau ($floor[SG]-[0-9]{2,3})$/i)
		{
			$class	=	"office";
			$id	=	$1;
			$id	=~	s/ - /,/g;
		}
		elsif ($id =~ /^Openspace ([A-Z]) ?($floor[0-9]{2})$/i)
		{
			$class	=	"openspace";
			$id	=	$1.$2;
		}
		elsif ($id =~ /^Openspace ($floor[SG]-[0-9]{2,3})$/i)
		{
			$class	=	"openspace";
			$id	=	$1;
			$id	=~	s/ - /,/g;
		}
		elsif ($id =~ /^[A-C][IP]$floor[0-9]{2}$/i)
		{
			$class	=	"office";
		}
		elsif ($id =~ /^parking\s*(.*)$/i)
		{
			$class	=	"parking";
			$id	=	$1;
			#$id	=~	s/ 1 ?$//g;
			#$id	=~	s/ +- +/,/g;
			#$id	=~	s/ +et +/,/g;
			#$id	=~	s/([0-6][GS])-([0-9]+)/$1$2/g;
			#$id	=~	s/-/,/g;
			#$id	=~	s/ //g;
		}
		elsif ($id =~ /^Salle de r(?:é|  )ui?nion ([-.\w'’\/ ]+)$/i) # || $id =~ /^(Salle du conseil).*$/i)
		{
			$class	=	"meeting-room";
			$id	=	$1;
			#$id	=	NFD($id);
			#$id	=~	s/\pM//g;
		}
		elsif ($id =~ /^[A-C]${floor} [A-Z ]+$/i)
		{
			$class	=	"meeting-room";
		}
		elsif ($id =~ /^Bulle ([-\w' ]+)$/i) # || $id =~ /^(Salle du conseil).*$/i)
		{
			$class	=	"bulle";
			$id	=	$1;
			#$id	=	NFD($id);
			#$id	=~	s/\pM//g;
		}
		elsif ($id =~ /^(?:(?:ESPACE (?:DE )?)?CONVIVIALIT(?:E|é|  )|ECHANGES INFORMELS|ECH.? INF.?|(?:Espace|Salle) (?:d')?[eé]changes?|Tisanerie|Tisannerie|Espace salon)/i)
		{
			$class	=	"chat-area";
			if ($id =~ /^Tisan*erie$/)
			{
				$node->setAttribute("showBubble", "1");
			}
		}
		elsif ($id =~ /^ESC(?:ALIER)?/i)
		{
			$class	=	"stairs";
		}
		elsif ($id =~ /^ASCENSEUR/i)
		{
			$class	=	"elevator";
		}
		elsif ($id =~ /^WC|Sanitaires?/i)
		{
			$class	=	"toilets";
			#$id =~ s/:.*(\s+\d+\s*)$/$1/;
		}
		elsif ($id =~ /^resto\s+(.*)$/i || $id =~ /^(restaurant.*)$/i)
		{
			$class	=	"resto";
			$id	=	$1;
		}
		elsif ($id =~ /^(?:espace|service )?courrier/i)
		{
			$class	=	"courrier";
		}
		elsif ($id =~ /^((?:espace|service )?m[eé]dical|infirmerie)/i)
		{
			$class	=	"medical";
		}
		elsif ($id =~ /^(?:espace|service )?concierge(rie)?/i)
		{
			$class	=	"concierge";
		}
		elsif ($id =~ /^service\s+(.*)/i)
		{
			$class	=	"service";
			$id	=	$1;
		}
		elsif ($id =~ /^Refuge PMR/i)
		{
			$class	=	"pmr";
			# XXX temp we skip it because we don't want it to appear on the map for now
			next;
		}
		elsif ($id =~ /^(?:TELECOPIEUR|Tri +\/ +Copie|Triu \/ Copie \/ Repro|Repro|Autre repro|Espace reprographie)/i)
		{
			$class	=	"repro";
		}
		elsif ($id =~ /^(?:auditorium|((espace|salle)( de))?conf[eé]rences?)/i)
		{
			$class	=	"conference";
		}
		elsif ($id =~ /^(?:Espace silence|Silence|Autre espace silence)/i)
		{
			$class	=	"silence";
		}
		elsif ($id =~ /^Invisible (.*)$/i)
		{
			$class	=	"invisible";
			$id	=	$1;
		}
		elsif ($id =~ /^Autre SAS/i)
		{
			next;
		}
		elsif ($id =~ /^(Cloison vitr(e|é|  )e|Vitre)/i)
		{
			$class = "glass";
		}
		elsif ($id =~ /^(?:RANGEMENT|LOCAL VDI|COURRIER\/CASIER|TELECOPIEUR|Courrier|Tri +\/ +Copie|Archive|Local technique|Stock|Triu \/ Copie \/ Repro|Local IT|Repro|Cuisine|Local ménage|Autre)/i)
		{
			$class	=	"other";
		}
		elsif ($id =~ /^Espace ([-.\w' ]+)$/i)
		{
			$class	=	"espace";
			$id	=	$1;
			#$id	=	NFD($id);
			#$id	=~	s/\pM//g;
		}
		elsif ($id =~ /^(flat-[0-9a-f]{6}) (.*)/i)
		{
			$class	=	$1;
			$id	=	$2;
		}
		else
		{
			print STDERR "${reverse}unknown type $id$normal\n";
			$class	=	"other";
		}
		if ($class eq "meeting-room" || $class eq "espace")
		{
			$name = $id;
			my $clean_name	=	lc NFD($name);
			$clean_name	=~	s/\pM//g;
			$clean_name	=~	s/\W//g;
			$clean_name	=~	s/(^\s*|\s*$)//g;
			if ($meeting_rooms_map{$clean_name})
			{
				$id = $meeting_rooms_map{$clean_name};
			}
			else
			{
				print $reverse."no mapping for meeting room $name ($clean_name)".$normal."\n";
			}
		}
		#if ($class eq "meeting-room" && $id eq "des Territoires")
		#{
		#$id = "Salle des Territoires";
		#}

		if (0)
		{
			# For offices, we use the rect or path that is used as a clipping area for the gradient
			my @nodes2 = $xpc->findnodes('./svg:g/svg:g/svg:defs/*[self::svg:path or self::svg:rect or self::svg:polygon]',$node);
			if (!@nodes2)
			{
				# For other surfaces, we use the plain filled rect or path
				@nodes2 = $xpc->findnodes('./svg:g/*[self::svg:path or self::svg:rect or self::svg:polygon]', $node);
			}
			if (!@nodes2)
			{
				print STDERR "no rect or path found for ".$node->toString()."\n";
				next;
			}
			my $node2 = $nodes2[0];
		}
		my $node2 = $node;
		if (lc $node2->nodeName() eq "rect" && (!$node2->getAttribute("width") || !$node2->getAttribute("height")))
		{
			print STDERR "ignoring rect with no width or height\n";
			next;
		}
		$node2->removeAttribute($_) for qw(id clip-path fill);
		$node2->setAttribute("id", $id);
		$node2->setAttribute("name", $name) if $name;
		$node2->setAttribute("class", $class) if $class;
		$data->{pois}{$class}	//=	{};
		my $json	=	svg_node_to_json($node2);
		if ($json)
		{
			$data->{pois}{$class}{$id}	=	$json;
		}
		#push @{$data->{pois}},	svg_node_to_json($node2);
	}

	my @desks = $xpc->findnodes('//svg:g[@id="Mobilier" or @id="mobilier" or @id="MOBILIER" or @id="MOBILIERS" or @inkscape:label="Mobilier" or @inkscape:label="mobilier" or @inkscape:label="MOBILIER" or @inkscape:label="MOBILIERS"]//*[self::svg:line or self::svg:polyline or self::svg:path]', $svg);
	print STDERR "Found ".scalar(@desks)." desks\n";

	$data->{desks}	=	{};
	$data->{furniture}	=	{};

	my %desk_ids;

	for my $desk (@desks)
	{
		my $color;
		my $size;
		my $text;
		my $text_type;
		my $height;
		my $indicator_x;
		my $indicator_y;
		my $indicator_a;
		# Get id from node
		my $name;
		my $id = $desk->getAttribute("id");
		my $label = $desk->getAttributeNS("http://www.inkscape.org/namespaces/inkscape","label");
		if ($label && $label =~ /^override\s+(.*)$/i)
		{
			$id = $1;
		}
		elsif ($label && $id =~ /^path[-_\s\d]+$/)
		{
			$id = $label;
		}
		next if !$id;
		if ($id =~ /^line/)
		{
			my $current = $desk->parentNode;
			my $newid;
			while (1)
			{
				$newid = $current->getAttribute("id");
				last if $newid !~ /^(line|g)/;
				die "Could not find named ancestor for $id" if $newid =~ /^mobilier$/i;
				$current = $current->parentNode;
			}
			$id = $newid;
		}
		$id =~ s/_$//;
		print STDERR "$id\n";
		$id =~ s/_x([0-9a-f]{2})_/sprintf("%c", hex($1))/egi;
		$id =~ s/_/ /g;
		if (exists $desk_ids{$id})
		{
			print STDERR "Duplicate id $id\n";
		}
		$desk_ids{$id}	=	undef;

		my $class;
		my @objects = ();
		my $where;
		if ($id =~ /^(SDR|Postes?)\s+([-A-Z0-9. ]+):(?:I([-+]?\d(?:\.\d)?)([-+]?\d(?:\.\d)?)A(\d):)?(?:(\d+)x(\d+):)?\s*(.*)$/i)
		{
			my $what = $1;
			my $office = $2;
			$indicator_x = $3?$3+0:undef;
			$indicator_y = $4?$4+0:undef;
			$indicator_a = $5?$5+0:undef;
			my $width = $6;
			my $depth = $7;
			my $desk_ids = $8;
			if (uc $what eq "SDR")
			{
				$class = "meeting";
			}
			else
			{
				$class = "desks";
			}
			if ($desk_ids =~ /=/)
			{
				my @desk_ids = split /\s*,\s*/,$desk_ids;
				for my $desk_id (@desk_ids)
				{
					if ($desk_id =~ /^(\d+)([GD]X?|C)=(.+)$/i)
					{
						my $o =
						{
							position => $1,
							side => $2,
							office => $office,
							desk => $3,
						};
						if ($depth && $width)
						{
							$o->{width} = 0+$width;
							$o->{depth} = 0+$depth;
						}
						push @objects, $o;
					}
					else
					{
						die "Could not match desk id $desk_id in id $id";
					}
				}
			}
			else
			{
				my @desk_ids;
				if ($desk_ids =~ /^(-?)([URNZ]?)(\d+)$/)
				{
					my $reverse = ($1 eq '-');
					my $layout = $2 || 'Z';
					my $count = $3;
					my $desk_id = 'A';
					if ($layout eq 'Z')
					{
						@desk_ids = map { $desk_id++ } (1 .. $count);
					}
					elsif ($layout eq 'N')
					{
						@desk_ids = map { chr(ord('A') + ($_%2) * ($count >> 1) + ($_ >> 1)) } (0 .. ($count-1));
					}
					elsif ($layout eq 'R')
					{
						@desk_ids = map { chr(ord('A') + (($_+1)%2) * ($count >> 1) + ($_ >> 1)) } (0 .. ($count-1));
					}
					if ($reverse)
					{
						@desk_ids = reverse @desk_ids;
					}
				}
				else
				{
					@desk_ids = split //,$desk_ids;
				}
				my $index = 0;
				for my $desk_id (@desk_ids)
				{
					if ($desk_id ne "-")
					{
						my $o =
						{
							position => ($index >> 1) + 1,
							side => ($index % 2)?"D":"G",
							office => $office,
							desk => $desk_id,
						};
						if ($depth && $width)
						{
							$o->{width} = 0+$width;
							$o->{depth} = 0+$depth;
						}
						push @objects, $o;
					}
					$index++;
				}
			}
			$where = "desks";
		}
		elsif ($id =~ /^meuble\s+([-_\w]+)/i)
		{
			$class = $1;
			$where = "furniture";
		}
		elsif ($id =~ /^tag\s+([-_\w]+)/i)
		{
			$class = $1;
			$where = "tag";
		}
		elsif ($id =~ /^(r?text(-top)?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s(.*)$/)		# text font size color text
		{
			$where = "text";
			$text_type = $1;
			$height = ($2 && $2 eq "-top")?1:0;
			$class = $3;
			$size = $4;
			$color = $5;
			$text = $6;
			$text =~ s/\\n/\n/g;
		}
		else
		{
			die $reverse."unknown desk type $id".$normal;
		}

		my $desk2 = $desk;
		if (lc $desk2->nodeName() eq "rect" && (!$desk2->getAttribute("width") || !$desk2->getAttribute("height")))
		{
			print STDERR "ignoring rect with no width or height\n";
			next;
		}
		$desk2->removeAttribute($_) for qw(id clip-path fill);
		$desk2->setAttribute("id", $id);
		svg_node_to_json($desk2, "furniture");
		my $type = lc $desk2->nodeName();
		my $point1;
		my $point2;
		if ($type eq "polygon")
		{
			my @points = split / /,$desk2->getAttribute("points");
			if (scalar @points != 2)
			{
				die $reverse."furniture $id not 2 points".$normal.Dumper(\@points, $desk2);
			}
			$point1 = [map { $_ + 0} split /,/,$points[0]];
			$point2 = [map { $_ + 0} split /,/,$points[1]];
		}
		elsif ($type eq "line")
		{
			$point1 =
			[
				$desk2->getAttribute("x1") + 0,
				$desk2->getAttribute("y1") + 0,
			];
			$point2 =
			[
				$desk2->getAttribute("x2") + 0,
				$desk2->getAttribute("y2") + 0,
			];
		}
		my $direction = atan2($point2->[1] - $point1->[1], $point2->[0] - $point1->[0]);
		#print STDERR "desk $id class $class point $point1 direction $direction\n";

		#$data->{$where}{$class}	//=	{};
		my $object =
			{
				id => $id,
				class => $class,
				point => $point1,
				direction => $direction,
				objects => \@objects,
			};
		$object->{text_type} = $text_type if $text_type;
		$object->{text} = $text if $text;
		$object->{height} = $height if $height;
		$object->{size} = $size if $size;
		$object->{color} = $color if $color;
		$object->{indicator_x} = $indicator_x if $indicator_x;
		$object->{indicator_y} = $indicator_y if $indicator_y;
		$object->{indicator_a} = $indicator_a if $indicator_a;

		$data->{$where}{$class}{$id}	= $object;
	}


	my $output_fh;
	open $output_fh,">$output_filename" or die "can't open $output_filename for writing: $!";
	binmode $output_fh,":utf8";

	print $output_fh to_json($data, { pretty => 1, canonical => 1 });
}

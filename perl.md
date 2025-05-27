Okay, this is a substantial Perl script with a lot of domain-specific logic for processing SVG floor plans. I'll go through it section by section, explaining the Perl syntax and the logic in a way a JavaScript developer can understand.

**Overall Purpose (from the script's POD documentation):**

This script converts SVG files (editable in Adobe Illustrator or Inkscape) into JSON files. These JSON files are then used by map display libraries.
Key features:
*   Handles different coordinate systems using a "calage" (alignment/calibration) rectangle.
*   "Flattens" SVG transforms (like `translate`, `rotate`, `scale`, `matrix`) so that all objects have direct, usable coordinates.
*   Cleans up superfluous points in polygons.
*   Simplifies certain types of SVG objects.
*   Removes some unnecessary objects.
*   Identifies and reprocesses different types of objects (rooms, furniture, etc.).

Let's break down the code:

```perl
#!/usr/bin/env -S perl -w

# Shebang line:
# #!/usr/bin/env -S perl -w
# This tells the operating system to execute this file using the 'perl' interpreter.
# '/usr/bin/env -S' is a way to find 'perl' in the user's PATH and allows passing arguments to perl.
# '-w' enables warnings, which is good practice for catching potential issues.
# In JS: Similar to how a .js file is run by Node.js, but this line makes the script directly executable (e.g., ./script.pl).

use XML::LibXML;        # Imports the XML::LibXML module for parsing XML (SVG is XML).
                        # JS equivalent: `const libxml = require('libxmljs');` (if using a similar library)
use JSON;               # Imports the JSON module for encoding data structures to JSON strings.
                        # JS equivalent: `JSON.stringify()` is built-in.
use strict;             # Enforces stricter syntax rules, like requiring variable declarations with 'my', 'our', or 'local'.
                        # JS equivalent: `'use strict';` at the top of a file or function.
use utf8;               # Tells Perl that the script itself is written in UTF-8. Important for handling Unicode characters in string literals.
use Unicode::Normalize; # Imports module for Unicode normalization (e.g., converting accented characters to a base character + combining diacritic).
use Math::Trig;         # Imports module for trigonometric functions (sin, cos, pi).
                        # JS equivalent: `Math.sin()`, `Math.cos()`, `Math.PI`.
use Getopt::Std;        # Imports module for parsing command-line options (like -d, -s).
                        # JS equivalent: Libraries like `yargs` or `commander`.
use File::Basename;     # Imports module for extracting parts of a file path (like directory name).
                        # JS equivalent: Node.js `path.dirname()`.

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

# =pod ... =cut : This is "Plain Old Documentation" (POD). It's Perl's built-in way to write documentation within the code.
# The text above is a summary of what the script does, as translated in the "Overall Purpose" section.

binmode STDOUT,":utf8"; # Sets the standard output stream to handle UTF-8 encoding.
                        # Ensures that characters printed to the console are correctly encoded.
binmode STDERR,":utf8"; # Sets the standard error stream to handle UTF-8 encoding.

my $options = {};       # 'my' declares a lexical variable (scoped to the current block).
                        # '$options' is a scalar variable (holds a single value). Here, it's initialized to a reference to an empty hash.
                        # A hash in Perl is like a JavaScript object (key-value pairs).
                        # {} creates an anonymous hash reference.
                        # JS equivalent: `let options = {};`

getopts("d:s:",$options); # Parses command-line options.
                          # "d:s:" means it expects options -d and -s, each followed by an argument.
                          # The parsed options will be stored in the $options hash.
                          # For example, if called with `-d /path/to/dest -s MYSITE`,
                          # $options would become: { d => '/path/to/dest', s => 'MYSITE' }
                          # JS equivalent: Handled by libraries like `yargs`.

my $reverse = "\x1b[7;31m"; # ANSI escape code for reverse video (background) with red text. Used for warnings.
my $normal = "\x1b[m";      # ANSI escape code to reset text formatting.
                            # JS equivalent: Could use libraries like `chalk` for terminal styling.

# '@ARGV' is a special Perl array containing the command-line arguments passed to the script (after options processed by getopts).
# This loop iterates over each filename provided as an argument.
# JS equivalent: `process.argv.slice(2).forEach(filename => { ... });` (approximately)
for my $filename (@ARGV)
{
	my $site;  # Declare a scalar variable for the site ID.
	my $floor; # Declare a scalar variable for the floor number/name.
	print STDERR "$filename\n"; # Print the current filename to standard error. Useful for progress/debugging.
	                            # String interpolation: variables inside double quotes are expanded.
	                            # JS equivalent: `console.error(`${filename}\n`);`

	# The directory which contains the SVG files and salles-name-to-id
	my $dir = dirname($filename); # 'dirname' (from File::Basename) gets the directory part of the $filename path.
	                              # JS equivalent: `const dir = path.dirname(filename);`

	# The directory which contains site mappings
	my $sites_map_filename = $dir."/../sites-map"; # String concatenation using '.'.
	                                               # Constructs the path to a 'sites-map' file, expected to be one level up from $dir.
	                                               # JS equivalent: `const sitesMapFilename = path.join(dir, '../sites-map');`

	my %sites; # Declares a hash named 'sites'. This will store site name to site ID mappings.
	           # JS equivalent: `let sites = {};`

	# Attempt to open the sites-map file for reading.
	# 'open my $sites_map_fh, $sites_map_filename' tries to open the file.
	# If successful, $sites_map_fh becomes a file handle (like a file descriptor).
	# The 'if' block executes only if the file is opened successfully.
	if (open my $sites_map_fh, $sites_map_filename)
	{
		binmode $sites_map_fh,":utf8"; # Set the file handle to read in UTF-8.

		# Read the file line by line.
		# '<$sites_map_fh>' reads one line from the file handle in a 'while' loop context.
		# Each line is assigned to the special variable '$_'.
		# JS equivalent (conceptual):
		// const fileContent = fs.readFileSync(sitesMapFilename, 'utf8');
		// for (const line of fileContent.split('\n')) { ... }
		while (<$sites_map_fh>)
		{
			chomp; # Removes the trailing newline character from '$_' (the current line).
			       # JS equivalent: `line = line.trimEnd();` or `line.replace(/\n$/, '')`

			s/\s*#.*$//; # Substitution regex on '$_'.
			             # `s/PATTERN/REPLACEMENT/`
			             # `\s*`: matches zero or more whitespace characters.
			             # `#`: matches the literal '#' character (start of a comment).
			             # `.*`: matches any character (except newline) zero or more times.
			             # `$`: matches the end of the line.
			             # `//`: replaces the matched part with an empty string (deletes it).
			             # Effectively removes comments (from '#' to end of line).
			             # JS equivalent: `line = line.replace(/\s*#.*$/, '');`

			s/^\s*//;    # Substitution regex on '$_'.
			             # `^`: matches the beginning of the line.
			             # `\s*`: matches zero or more whitespace characters.
			             # Removes leading whitespace.
			             # JS equivalent: `line = line.replace(/^\s*/, '');` (or `line.trimStart()`)

			next if !$_; # If '$_' is now empty (or considered false in Perl, like "", "0"), skip to the next iteration of the loop.
			             # JS equivalent: `if (!line) continue;`

			my ($name, $id)=	split /\t/; # 'split /\t/' splits '$_' by tab characters.
			                              # The resulting parts are assigned to $name and $id.
			                              # JS equivalent: `let [name, id] = line.split('\t');`

			# This block is a warning for an old format where space might have been used as a separator instead of tab.
			if (!$id && /^[^ ]+ [^ ]+$/) # If $id is not defined (false) AND the line matches "non-space_chars space non-space_chars"
			{
				print STDERR "${reverse}Warning: sites-map uses space as separator${normal}\n"; # Print a warning using the ANSI codes.
				($name, $id)=	split / /; # Re-split by space.
			}

			$name	=~	s/(^\s+|\s+$)//g; # Regex on $name. `s/PATTERN/REPLACEMENT/g` (global)
			                              # `(^\s+|\s+$)`: matches leading whitespace OR trailing whitespace.
			                              # `//g`: replaces all occurrences with empty string (trims whitespace from both ends).
			                              # JS equivalent: `name = name.trim();`
			$id	=~	s/(^\s+|\s+$)//g; # Same for $id.
			                              # JS equivalent: `id = id.trim();`

			# Normalize the site name for consistent matching:
			$name	=	lc NFD($name);    # `lc`: converts to lowercase.
			                              # `NFD($name)`: (from Unicode::Normalize) converts to Unicode Normalization Form D.
			                              # This decomposes characters like 'é' into 'e' + '´' (combining acute accent).
			                              # JS equivalent: `name = name.toLowerCase().normalize('NFD');`

			$name	=~	s/\pM//g;         # Regex on $name. `\pM` matches any Unicode Mark character (like combining accents).
			                              # Removes all diacritics/accents.
			                              # JS equivalent: `name = name.replace(/\p{M}/gu, '');` (note the 'u' flag for Unicode)

			$name	=~	s/\W+/_/g;        # Regex on $name. `\W+` matches one or more non-alphanumeric characters.
			                              # Replaces them with a single underscore '_'.
			                              # JS equivalent: `name = name.replace(/\W+/g, '_');`

			$sites{$name} = $id; # Store the processed name and ID in the %sites hash.
			                     # JS equivalent: `sites[name] = id;`
		}
		close $sites_map_fh; # Close the file handle.
		#print STDERR Dumper({sites => \%sites}); # Dumper is a debugging tool to print data structures. \%sites is a reference to the %sites hash.
	}

	# Determine the destination directory for the output JSON file.
	# If $options->{d} (from -d command-line arg) is set, use it.
	# Otherwise, default to $dir."/../../data" (two levels up from SVG dir, then into 'data').
	# The `//` operator is a "defined-or" operator.
	# JS equivalent: `const destDir = options.d ?? path.join(dir, '../../data');`
	my $dest_dir = $options->{d} // ($dir."/../../data");

	# This regex attempts to extract site name and floor information from the SVG filename.
	# Example filename: "MyBuilding-WingA1 R+2.svg" or "SomeSite-01-RDC.svg"
	# Breakdown of the regex:
	# (?:^|[\/\\])          : Non-capturing group. Matches start of string OR a slash (forward or back). Ensures we match the filename part.
	# ([-\w\s]+?\d*)        : Capture group 1 ($1): Site name part.
	#                         - [-\w\s]+? : One or more hyphens, word characters (alphanumeric+underscore), or whitespace, non-greedy.
	#                         - \d*       : Zero or more digits (often part of a site identifier).
	# (?:\s|-)              : Non-capturing group. Matches a space OR a hyphen (separator before floor).
	# (?:R\+(\d+)|R(-\d+)|(RDC|E[01]?|M|P\d*)) : Capture groups for floor ($2, $3, $4). This is complex, matching various floor notations:
	#                         - R\+(\d+)     : "R+" followed by digits (e.g., R+1, R+2). $2 captures the digits.
	#                         - R(-\d+)      : "R" followed by a negative number (e.g., R-1). $3 captures the negative number.
	#                         - (RDC|E[01]?|M|P\d*) : Other floor codes. $4 captures one of these.
	#                                           - RDC: Ground floor ("Rez-de-chaussée").
	#                                           - E[01]?: "E", "E0", "E1" (likely "Entresol" or similar).
	#                                           - M: Mezzanine?
	#                                           - P\d*: Parking level?
	# \.svg$                : Matches ".svg" at the end of the string.
	# i                     : Case-insensitive match.
	if ($filename =~ /(?:^|[\/\\])([-\w\s]+?\d*)(?:\s|-)(?:R\+(\d+)|R(-\d+)|(RDC|E[01]?|M|P\d*))\.svg$/i)
	{
		# $2 // $3 // $4: Uses defined-or to pick the first defined capture group among $2, $3, $4 for the floor.
		$floor = $2 // $3 // $4;
		$floor = 0 if $floor eq "RDC"; # If floor is "RDC", set it to 0. `eq` is string comparison.

		# Determine the site ID.
		if ($options->{s}) # If -s option was provided on command line.
		{
			$site = $options->{s}; # Use the site ID from the command line.
		}
		else
		{
			# If no -s option, derive site ID from filename and the %sites map.
			my $fullsite	=	lc NFD($1); # Get captured site part from filename ($1), lowercase, NFD normalize.
			$fullsite	=~	s/\pM//g;       # Remove diacritics.
			$fullsite	=~	s/[-\s]+/_/g;   # Replace hyphens/spaces with underscores.

			# This regex tries to match a pattern like "prefix_digits" (e.g., "buildinga_01").
			# If it matches, it assumes $1 is a generic prefix and $2 is an "EDS" number (Entity, Department, Service?).
			# It then looks up the prefix in %sites and substitutes $eds into a placeholder like '$1'.
			# Example: if sites-map has "buildinga" => "SITE_CODE_$1_XYZ" and filename gives "buildinga_01",
			# site becomes "SITE_CODE_01_XYZ".
			if ($fullsite =~ /^(\w+)_(\d+)(?:_|$)/)
			{
				my $eds = $2;
				$site = $sites{$1}; # Look up the prefix part (e.g., "buildinga") in the %sites map.
				$site =~ s/\$1/$eds/g if $site; # If a mapping was found, replace "$1" placeholder with $eds.
			}
			else
			{
				$site = $sites{$fullsite}; # Otherwise, look up the fully processed $fullsite name.
			}
			# If $site is still not defined after these attempts, the script can't determine the site ID.
			die "Can't match site $fullsite!" if !$site; # 'die' terminates the script with an error message.
		}
	}
	else
	{
		die "Can't match filename $filename!"; # If filename doesn't match the expected pattern.
	}

	# Load meeting room name to ID mappings.
	my $meeting_rooms_map_filename = $dir."/salles-name-to-id"; # Path to the mapping file.
	my %meeting_rooms_map = (); # Initialize an empty hash for meeting room mappings.
	                            # JS equivalent: `let meetingRoomsMap = {};`
	if (open my $meeting_rooms_map_fh, $meeting_rooms_map_filename) # Try to open the file.
	{	#or die "can't open $meeting_rooms_map_filename: $!"; # This 'or die' is commented out.
		binmode $meeting_rooms_map_fh,":utf8";
		while (<$meeting_rooms_map_fh>) # Read line by line.
		{
			chomp;
			s/\s*#.*$//;    # Remove comments.
			s/^\s*//;       # Remove leading whitespace.
			next if !$_;    # Skip empty lines.
			my ($name, $id) = split /\t/; # Split by tab.
			$name	=~	s/(^\s+|\s+$)//g; # Trim name.
			$id	=~	s/(^\s+|\s+$)//g;   # Trim id.

			# Normalize meeting room name for matching:
			$name	=	lc NFD($name);  # Lowercase, NFD normalize.
			$name	=~	s/\pM//g;       # Remove diacritics.
			$name	=~	s/\W//g;        # Remove ALL non-word characters (stricter than for sites).
			                                # This makes the key very "clean", e.g., "Salle O'Malley" -> "salleomalley".
			$meeting_rooms_map{$name} = $id; # Store in hash.
		}
		close $meeting_rooms_map_fh;
	}
	#print Dumper(\%meeting_rooms_map); # Debugging.

	# "Calage" (Calibration/Alignment) rectangle.
	# This is a hardcoded hash %calage that defines a target bounding box [x, y, width, height]
	# for specific sites. The SVG's own "Calage" rectangle will be transformed to fit this target box.
	# This ensures consistency across different floors or SVGs for the same site.
	# XXX comments in the script indicate these are La Poste-specific and should ideally not be hardcoded.
	my %calage=
	(
		"BRU" => [90.811, 173.738, 1079.809, 791.261], # Site "BRU" maps to an array ref of 4 numbers.
		# ... many other site-specific calibration values ...
		"761-ROU" => [90.811, 173.738, 1079.809, 791.261],
	);
	my ($nx, $ny, $nw, $nh); # Declare target x, y, width, height for calage.
	if ($calage{$site}) # Check if the current $site has an entry in the %calage hash.
	{
		# If yes, dereference the array and assign its elements to $nx, $ny, $nw, $nh.
		# @{$calage{$site}} dereferences the array stored in $calage{$site}.
		# JS equivalent (conceptual):
		// if (calage[site]) {
		//   [nx, ny, nw, nh] = calage[site];
		// }
		($nx, $ny, $nw, $nh) = @{$calage{$site}};
	}
	else
	{
		warn "Manque infos de calage pour $site"; # 'warn' prints a warning message to STDERR but doesn't stop the script.
	}
	print STDERR "$site-$floor\n"; # Print site and floor being processed.

	# Construct the output JSON filename.
	my $output_filename = "$dest_dir/$site-$floor.json";
	print "Saving to $output_filename\n"; # User feedback.

	# Initialize XML parser.
	# load_ext_dtd => 0:  Do not load external DTDs (Document Type Definitions). Good for security and speed.
	# huge => 1: Allow parsing of large XML documents.
	my $parser = XML::LibXML->new(load_ext_dtd => 0, huge => 1);
	my $svg = $parser->load_xml(location=>$filename) or die "couldn't load $filename: $!";
	# '$parser->load_xml(location=>$filename)' parses the SVG file.
	# 'or die ...' : if load_xml fails (returns false), the script terminates with the message.
	# $svg now holds the parsed XML document object.

	my $xpc = XML::LibXML::XPathContext->new; # Create an XPath context object. XPath is a language for querying XML.
	$xpc->registerNs('svg', 'http://www.w3.org/2000/svg'); # Register the 'svg' namespace prefix for XPath queries.
	                                                     # This allows writing queries like '//svg:rect' instead of '//*[local-name()="rect" and namespace-uri()="http://www.w3.org/2000/svg"]'.

	my $data	=	{}; # Initialize an empty hash reference. This will hold all extracted data to be converted to JSON.
	                    # JS equivalent: `let data = {};`

	# This hash maps SVG element types to an array of their relevant geometric attributes.
	# Used later to extract these attributes.
	my %attrs_per_type=
	(
		rect		=>	[qw(x y width height)], # qw() is "quote words", creates a list of strings.
		polygon		=>	["points"],
		path		=>	["d"],
		line		=>	[qw(x1 x2 y1 y2)],
		polyline	=>	 ["points"],
	);
	my $global_transform; # This will store the transformation matrix derived from the "Calage" rectangle.

	# --- Helper Subroutines ---

	# Subroutine to transform a single point (x, y) using a 2D affine transformation matrix.
	# The matrix is [a, b, c, d, e, f] representing:
	# x' = a*x + c*y + e
	# y' = b*x + d*y + f
	sub transform_point
	{
		my $x		=	shift; # 'shift' removes and returns the first element from @_ (argument list).
		my $y		=	shift;
		my $transform	=	shift; # This will be an array reference like [$a, $b, $c, $d, $e, $f]

		#die if !defined $x; # Commented out check.
		return [ # Returns an array reference (a list of two elements).
			$x * $transform->[0] + $y * $transform->[2] + $transform->[4],
			$x * $transform->[1] + $y * $transform->[3] + $transform->[5],
		];
	}

	# Helper subroutine used by 'transform_node' when processing SVG <path> elements.
	# It transforms a point and appends it to the new path string and potentially a polygon point list.
	sub add_point
	{
		my $command = shift;            # e.g., 'M', 'L' (SVG path command)
		my $x = shift;                  # x-coordinate
		my $y = shift;                  # y-coordinate
		my $transform = shift;          # Transformation matrix (array ref)
		my $newpath_ref = shift;        # Reference to the string building the new path data
		my $is_polygon_ref = shift;     # Reference to a boolean indicating if the path is currently a simple polygon
		my $polygon_points_ref = shift; # Reference to an array storing polygon points
		my $force_add_firstpoint = shift; # Optional flag

		# Transform the point
		my $point_array_ref = transform_point($x, $y, $transform);
		my $point_string = join(",", @{$point_array_ref}); # Dereference $point_array_ref into a list, then join with comma. e.g., "10.5,20.3"

		# Append to the new path string
		$$newpath_ref .= $command . $point_string; # $$newpath_ref dereferences the scalar reference to access the string.
		                                           # '.=' is string concatenation assignment.

		# If we're trying to interpret this path as a polygon:
		if ($$is_polygon_ref)
		{
			# Only simple 'L' (lineto) or 'M' (moveto, if it's the first point) commands keep it a polygon.
			if ($command =~ /^[lL]$/ || (!scalar @$polygon_points_ref && $command =~ /^[mM]$/))
			{
				# `scalar @$polygon_points_ref` gets the number of elements in the dereferenced array.
				# Add point to polygon list if:
				# - it's forced, OR
				# - it's the first point, OR
				# - it's not identical to the very first point (to avoid redundant closing point if path already closes).
				if ($force_add_firstpoint || !scalar @$polygon_points_ref || $point_string ne $$polygon_points_ref[0])
				{
					push @$polygon_points_ref, $point_string; # push adds to end of array (dereferenced).
				}
			}
			else
			{
				$$is_polygon_ref = 0; # If a complex command (like curve) is encountered, it's no longer a simple polygon.
			}
		}
	}

	# This is a crucial subroutine. It applies a given transformation matrix
	# directly to the attributes of an SVG node, effectively "flattening" the transform.
	# For example, a <rect> with a 'transform="rotate(45)"' will have its x, y, width, height
	# changed, and its 'transform' attribute removed (or if it becomes a polygon, its points).
	sub transform_node
	{
		my $node	=	shift; # The XML::LibXML node object.
		my $transform	=	shift; # The transformation matrix (array ref).
		my $mode	=	shift; # Optional mode, e.g., "itinerary", which affects path closing.

		return if !$transform; # If no transform, do nothing.
		#return if $transform->[0] == 1 && !$transform->[1] && !$transform->[2] && $transform->[3] == 1 && !$transform->[4] && !$transform->[5];
		# The commented line above would be an optimization to skip identity transforms.

		my $type	=	lc $node->nodeName(); # Get the SVG element type (rect, path, etc.) in lowercase.

		if ($type eq "rect")
		{
			my ($x, $y, $w, $h) = map { $node->getAttribute($_) } qw(x y width height);
			# `map { $node->getAttribute($_) } LIST` calls getAttribute for each item in LIST.

			# Optimization: If the transform matrix has no rotation/skew components (b=0, c=0),
			# a transformed rectangle is still a rectangle. Only scaling and translation.
			# Matrix: [a, b, c, d, e, f]. Here, $transform->[1] is b, $transform->[2] is c.
			if (!$transform->[1] && !$transform->[2])
			{
				my $p1 = transform_point($x, $y, $transform);         # Top-left corner
				my $p2 = transform_point($x + $w, $y + $h, $transform); # Bottom-right corner
				my ($nw, $nh) = ($p2->[0] - $p1->[0], $p2->[1] - $p1->[1]); # New width and height
				$node->setAttribute("x", $p1->[0]);
				$node->setAttribute("y", $p1->[1]);
				$node->setAttribute("width", abs($nw)); # Use abs in case of negative scaling
				$node->setAttribute("height", abs($nh));
			}
			else
			{
				# If there's rotation/skew, the rectangle becomes a polygon (a quadrilateral).
				$node->setNodeName("polygon"); # Change the node type from <rect> to <polygon>.
				$node->removeAttribute($_) for qw(x y width height); # Remove old rect attributes.
				my @points_arr_refs = (); # Array to hold point array references like [ [x1,y1], [x2,y2], ... ]
				# Transform each corner of the original rectangle:
				push @points_arr_refs, transform_point($x, $y, $transform);         # Top-left
				push @points_arr_refs, transform_point($x + $w, $y, $transform);   # Top-right
				push @points_arr_refs, transform_point($x + $w, $y + $h, $transform); # Bottom-right
				push @points_arr_refs, transform_point($x, $y + $h, $transform);     # Bottom-left
				# Convert array of point-arrays into a space-separated string of "x,y" pairs for the polygon's 'points' attribute.
				# `map { join(",",@$_) } @points_arr_refs` -> for each point [px, py], make "px,py"
				# `join(" ", ...)` -> join these "px,py" strings with spaces.
				$node->setAttribute("points",join(" ",map { join(",",@$_) } @points_arr_refs));
			}
		}
		elsif ($type eq "line")
		{
			my ($x1, $y1, $x2, $y2) = map { $node->getAttribute($_) } qw(x1 y1 x2 y2);
			my $p1 = transform_point($x1, $y1, $transform); # Transform start point
			my $p2 = transform_point($x2, $y2, $transform); # Transform end point
			$node->setAttribute("x1", $p1->[0]);
			$node->setAttribute("y1", $p1->[1]);
			$node->setAttribute("x2", $p2->[0]);
			$node->setAttribute("y2", $p2->[1]);
		}
		elsif ($type eq "polygon" || $type eq "polyline")
		{
			my $points_str = $node->getAttribute("points");
			$points_str =~ s/(^\s+|\s+$)//g; # Trim whitespace.
			$points_str =~ s/\s+/ /g;        # Normalize multiple spaces to single space.
			# This regex converts "x1 y1 x2 y2 ..." to "x1,y1 x2,y2 ...".
			# It looks for number-space-number sequences.
			$points_str =~ s/(?:^|(?<= ))(-?\d*(?:\.\d+)?) +(-?\d*(?:\.\d+)?)(?:$|(?= ))/$1,$2/g;

			# Split the string "x1,y1 x2,y2 ..." into an array of "x,y" strings: ["x1,y1", "x2,y2", ...]
			my @point_pairs_str = split /\s+/, $points_str;
			# For each "x,y" string, split by comma into [$x,$y], then transform this point.
			my @transformed_points_arr_refs = map {
				my @coords = split /,/, $_;
				transform_point($coords[0], $coords[1], $transform);
			} @point_pairs_str;
			# Join back into the "x1,y1 x2,y2 ..." format.
			$node->setAttribute("points",join(" ",map {join(",",@$_)} @transformed_points_arr_refs));
		}
		elsif ($type eq "path")
		{
			# Path transformation is the most complex as it involves parsing the 'd' attribute.
			# It tries to convert simple paths (only M, L, H, V, Z commands) into polygons/polylines.
			my $path_d = $node->getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "original-d") || $node->getAttribute("d");
			# Inkscape sometimes stores the original path in 'inkscape:original-d'. Use it if available.
			# `||` is logical OR, short-circuiting.
			# JS equivalent: `const pathD = node.getAttributeNS(...) || node.getAttribute('d');`

			my $oldpath = $path_d; # Keep a copy for error messages.
			my $newpath_str = "";  # String to build the new transformed 'd' attribute.
			my $current_command = ""; # Current SVG path command (M, L, C, etc.).
			my $current_x = 0;     # Current x position.
			my $current_y = 0;     # Current y position.
			my $start_x = 0;       # x position of the start of the current subpath (after M).
			my $start_y = 0;       # y position of the start of the current subpath.
			my $is_simple_polygon = 1; # Flag: true if path only contains M,L,H,V,Z.
			my @polygon_points_list = (); # If it's simple, collect points here.

			# Loop through the path data string, consuming parts of it.
			while ($path_d)
			{
				# Try to match a command letter (M, m, L, l, etc.).
				if ($path_d =~ s/^\s*([mMlLhHvVcCsSqQtTaAzZ])\s*//) # `s///` with `//` empty replacement means "match and remove".
				{
					$current_command = $1; # $1 is the captured command letter.
				}
				elsif ($path_d =~ s/^[ ,]*//) # If no command, consume leading spaces or commas.
				{
					# (no new command, implies repeat of previous command with new coords, e.g. "L 10,10 20,20")
				}

				# --- Handle different path commands ---
				# For each command type, it extracts coordinates, updates $current_x, $current_y,
				# transforms the point(s), and appends to $newpath_str.
				# It also calls `add_point` to potentially build `@polygon_points_list`.

				# Relative moveto (m), lineto (l), T-curve (t) - expect two numbers (dx, dy)
				if ($current_command =~ /^[lmt]$/ && $path_d =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					# Regex for a number, optional comma/space, then another number.
					# `(?:e-?\d+)?` handles scientific notation like 1.2e-5.
					# `(?:,|(?=[-.]))` matches a comma OR a position followed by a digit sign or dot (SVG allows space as separator).
					my $dx = $1;
					my $dy = $2;
					$current_x += $dx;
					$current_y += $dy;
					add_point(uc($current_command), $current_x, $current_y, $transform, \$newpath_str, \$is_simple_polygon, \@polygon_points_list);
					# `uc()` converts to uppercase (e.g., 'm' becomes 'M' because we're now using absolute transformed coords).
					# `\$newpath_str`, `\$is_simple_polygon`, `\@polygon_points_list` are references passed to `add_point`.
					if ($current_command eq "m") # After a relative moveto 'm'
					{
						$start_x = $current_x; # Record start of subpath
						$start_y = $current_y;
						$current_command = "l"; # Subsequent coordinate pairs for 'm' are treated as 'l'.
					}
				}
				# Absolute moveto (M), lineto (L), T-curve (T) - expect two numbers (x, y)
				elsif ($current_command =~ /^[LMT]$/ && $path_d =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,| |(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$current_x = $1;
					$current_y = $2;
					add_point(uc($current_command), $current_x, $current_y, $transform, \$newpath_str, \$is_simple_polygon, \@polygon_points_list);
					if ($current_command eq "M")
					{
						$start_x = $current_x;
						$start_y = $current_y;
						$current_command = "L"; // Subsequent pairs for 'M' are 'L'.
					}
				}
				# Relative horizontal lineto (h) - one number (dx)
				elsif ($current_command eq "h" && $path_d =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$current_x += $1;
					add_point('L', $current_x, $current_y, $transform, \$newpath_str, \$is_simple_polygon, \@polygon_points_list);
				}
				# Absolute horizontal lineto (H) - one number (x)
				elsif ($current_command eq "H" && $path_d =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$current_x = $1;
					add_point('L', $current_x, $current_y, $transform, \$newpath_str, \$is_simple_polygon, \@polygon_points_list);
				}
				# Relative vertical lineto (v) - one number (dy)
				elsif ($current_command eq "v" && $path_d =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$current_y += $1;
					add_point('L', $current_x, $current_y, $transform, \$newpath_str, \$is_simple_polygon, \@polygon_points_list);
				}
				# Absolute vertical lineto (V) - one number (y)
				elsif ($current_command eq "V" && $path_d =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$current_y = $1;
					add_point('L', $current_x, $current_y, $transform, \$newpath_str, \$is_simple_polygon, \@polygon_points_list);
				}
				# Close path (z or Z)
				elsif ($current_command =~ /^[zZ]$/)
				{
					$current_x = $start_x; # Move current point back to start of subpath.
					$current_y = $start_y;
					if ($mode && $mode eq "itinerary")
					{
						# For "itinerary" mode, explicitly add a line segment to close, instead of 'Z',
						# because itineraries are often polylines, and 'Z' implies polygon.
						# The '1' as last arg to add_point forces adding the point even if it's same as first.
						add_point('L', $current_x, $current_y, $transform, \$newpath_str, \$is_simple_polygon, \@polygon_points_list, 1);
					}
					else
					{
						$newpath_str .= 'Z'; # Append 'Z' to the new path string.
					}
				}
				# Relative cubic Bezier (c) - three pairs of (dx, dy)
				elsif ($current_command eq "c" && $path_d =~ s/^(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,| |(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,| |(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?(?:e-?\d+)?)//)
				{
					$is_simple_polygon = 0; # Curves mean it's not a simple polygon.
					# Transform control points and end point.
					my $cp1 = transform_point($current_x+$1, $current_y+$2, $transform);
					my $cp2 = transform_point($current_x+$3, $current_y+$4, $transform);
					my $ep  = transform_point($current_x+$5, $current_y+$6, $transform);
					$newpath_str .= 'C'.join(",", @$cp1, @$cp2, @$ep); # Append transformed 'C' command.
					$current_x += $5; # Update current position to end point of curve.
					$current_y += $6;
				}
				# Absolute cubic Bezier (C) - three pairs of (x, y)
				elsif ($current_command eq "C" && $path_d =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_simple_polygon = 0;
					my $cp1 = transform_point($1, $2, $transform);
					my $cp2 = transform_point($3, $4, $transform);
					my $ep  = transform_point($5, $6, $transform);
					$newpath_str .= 'C'.join(",", @$cp1, @$cp2, @$ep);
					$current_x = $5;
					$current_y = $6;
				}
				# Relative quadratic (q) or smooth quadratic (s) Bezier - two pairs of (dx, dy)
				elsif ($current_command =~ /^[sq]$/ && $path_d =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_simple_polygon = 0;
					my $cp1 = transform_point($current_x+$1, $current_y+$2, $transform);
					my $ep  = transform_point($current_x+$3, $current_y+$4, $transform);
					$newpath_str .= uc($current_command).join(",", @$cp1, @$ep);
					$current_x += $3;
					$current_y += $4;
				}
				# Absolute quadratic (Q) or smooth quadratic (S) Bezier - two pairs of (x, y)
				elsif ($current_command =~ /^[SQ]$/ && $path_d =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_simple_polygon = 0;
					my $cp1 = transform_point($1, $2, $transform);
					my $ep  = transform_point($3, $4, $transform);
					$newpath_str .= uc($current_command).join(",", @$cp1, @$ep);
					$current_x = $3;
					$current_y = $4;
				}
				# Relative elliptical arc (a) - rx, ry, x-axis-rotation, large-arc-flag, sweep-flag, dx, dy
				elsif ($current_command eq "a" && $path_d =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))([01])(?:,|(?=[-.]))([01])(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_simple_polygon = 0;
					# NOTE: This is a simplification. Transforming arcs correctly is complex.
					# It only transforms the end point (dx, dy). rx, ry, and x-axis-rotation would also need adjustment
					# if the transform involves non-uniform scaling or shear. The script acknowledges this with "XXX".
					my $ep = transform_point($current_x+$6, $current_y+$7, $transform);
					$newpath_str .= 'A'.join(",",$1,$2,$3,$4,$5, @$ep);
					$current_x += $6;
					$current_y += $7;
				}
				# Absolute elliptical arc (A) - rx, ry, x-axis-rotation, large-arc-flag, sweep-flag, x, y
				elsif ($current_command eq "A" && $path_d =~ s/^(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))([01])(?:,|(?=[-.]))([01])(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)//)
				{
					$is_simple_polygon = 0;
					# Similar simplification as relative arc 'a'.
					my $ep = transform_point($6, $7, $transform); # Note: used $x+$6, $y+$7 in 'a' but just $6, $7 here. This looks like a bug in the original script for absolute 'A', should be just $6, $7. Assuming it's using absolute coords of endpoint.
                                                                    # Oh, wait, $x and $y are not updated from $6 and $7 until *after* this line in the original code for 'A'.
                                                                    # For an absolute arc, the end point (x,y) is absolute. $6, $7 are the target x,y.
                                                                    # $current_x, $current_y are the *start* of this arc segment.
                                                                    # The transformed end point is based on the original target ($6, $7).
					$newpath_str .= 'A'.join(",",$1,$2,$3,$4,$5, @$ep); # Parameters, then transformed end point.
					$current_x = $6; # Update current position to the (original, untransformed) target x.
					$current_y = $7; # Update current position to the (original, untransformed) target y.
                                     # This is subtle: path parsing continues based on original coordinates, but transformed ones are written.
				}
				else
				{
					# If path data doesn't match any known command pattern.
					die "Could not match $path_d for command $current_command in $oldpath";
				}
			} # end while ($path_d)

			# After processing the whole path:
			if ($is_simple_polygon)
			{
				# If the path only contained M, L, H, V, Z commands, convert it to a <polygon> or <polyline>.
				# For "itinerary" mode, always use <polyline>.
				$node->setNodeName(($mode && $mode eq "itinerary") ? "polyline" : "polygon");
				$node->setAttribute("points", join(" ", @polygon_points_list));
				$node->removeAttribute("d"); # Remove the old 'd' attribute.
			}
			else
			{
				# If it was a complex path (curves, arcs), update its 'd' attribute.
				$node->setAttribute("d", $newpath_str);
			}
		}
		else # For any other SVG element type not explicitly handled.
		{
			warn "transform for type $type not supported";
		}
	} # end sub transform_node

	# Calculates the perimeter of a polygon.
	# $points is an array reference of point array references: [ [x1,y1], [x2,y2], ... ]
	sub polygon_perimeter
	{
		my $points_arr_ref = shift;
		my $length = 0;

		for my $i (0 .. $#$points_arr_ref) # Loop from index 0 to last index of @$points_arr_ref.
		                                   # `$#$points_arr_ref` is the last index.
		{
			my $v1 = $points_arr_ref->[$i]; # Current point [x,y]
			my $v2 = $points_arr_ref->[($i+1) % scalar(@$points_arr_ref)]; # Next point, wraps around for last segment.
			                                                              # `scalar(@$points_arr_ref)` is array length.
			my $dx = $v2->[0] - $v1->[0];
			my $dy = $v2->[1] - $v1->[1];
			$length += sqrt($dx * $dx + $dy * $dy); # Pythagorean theorem for distance.
		}
		return $length;
	}

	# Calculates the area of a polygon using the shoelace formula.
	# $points is an array reference of point array references: [ [x1,y1], [x2,y2], ... ]
	sub polygon_area
	{
		my $points_arr_ref = shift;
		my $area = 0;

		for my $i (0 .. $#$points_arr_ref)
		{
			my $v1 = $points_arr_ref->[$i];
			my $v2 = $points_arr_ref->[($i+1) % scalar(@$points_arr_ref)];
			$area += $v1->[0] * $v2->[1] - $v2->[0] * $v1->[1]; # Shoelace formula component
		}
		return abs($area / 2); # Area is half the absolute sum.
	}


	# Main function to convert an SVG node to a JSON-like hash structure.
	# This function orchestrates applying inherited transforms and then the global "calage" transform.
	sub svg_node_to_json
	{
		my $node	=	shift; # The XML::LibXML node object to process.
		my $mode	=	shift; # Optional mode (e.g., "itinerary", "furniture").

		# Apply inherited transforms:
		# Walk up the XML tree from the current $node towards the <svg> root.
		# If any parent <g> element has a 'transform' attribute, apply it to $node.
		my $current_element_for_transform_scan = $node;
		# XML_DOCUMENT_NODE is the root of the document. Loop until we hit it or the <svg> element.
		while ($current_element_for_transform_scan->nodeType != XML::LibXML::XML_DOCUMENT_NODE && lc $current_element_for_transform_scan->nodeName ne 'svg')
		{
			my $transform_attr_val = $current_element_for_transform_scan->getAttribute("transform");
			if ($transform_attr_val)
			{
				# Parse the 'transform' attribute string (e.g., "matrix(...)", "translate(...)", "rotate(...)").
				if ($transform_attr_val =~ /^matrix\(([-0-9e. ,]+)\)$/) # 'matrix(a,b,c,d,e,f)'
				{
					my @matrix_values = split /[ ,]+/, $1; # Split values by space or comma.
					if (scalar(@matrix_values) != 6)
					{
						die "unsupported transform matrix $1";
					}
					transform_node($node, \@matrix_values, $mode); # Apply this matrix to the $node.
				}
				elsif ($transform_attr_val =~ /^translate\s*\(\s*(-?\d*(?:\.\d*)?)(?:[, ]+(-?\d*(?:\.\d*)?))?\s*\)\s*$/) # 'translate(tx [, ty])'
				{
					my $tx = $1;
					my $ty = $2 // 0; # $2 might be undefined if only tx is given; default ty to 0.
					my $matrix = [ 1, 0, 0, 1, $tx, $ty ]; # Equivalent matrix for translation.
					transform_node($node, $matrix, $mode);
				}
				elsif ($transform_attr_val =~ /^scale\s*\(\s*(-?\d*(?:\.\d*)?)(?:[, ]+(-?\d*(?:\.\d*)?))?\s*\)\s*$/) # 'scale(sx [, sy])'
				{
					my $sx = $1;
					my $sy = $2 // $sx; # If sy is not given, it defaults to sx.
					my $matrix = [ $sx, 0, 0, $sy, 0, 0 ]; # Equivalent matrix for scaling.
					transform_node($node, $matrix, $mode);
				}
				elsif ($transform_attr_val =~ /^rotate\s*\(\s*(-?\d*(?:\.\d*)?)\s*\)\s*$/) # 'rotate(angle)' around origin (0,0)
				{
					my $angle_deg = $1;
					my $angle_rad = $angle_deg * pi / 180; # `pi` from Math::Trig
					my $cos_a = cos($angle_rad);
					my $sin_a = sin($angle_rad);
					my $matrix = [ $cos_a, $sin_a, -$sin_a, $cos_a, 0, 0 ]; # Rotation matrix.
					transform_node($node, $matrix, $mode);
				}
				elsif ($transform_attr_val =~ /^\s*rotate\s*\(\s*(-?\d*(?:\.\d*)?)[, ]+(-?\d*(?:\.\d*)?)[, ]+(-?\d*(?:\.\d*)?)\s*\)\s*$/) # 'rotate(angle, cx, cy)'
				{
					# Rotation around a center point (cx, cy) is:
					# 1. Translate by (-cx, -cy)
					# 2. Rotate by angle
					# 3. Translate by (cx, cy)
					my $angle_deg = $1;
					my $center_x = $2;
					my $center_y = $3;
					my $angle_rad = $angle_deg * pi / 180;
					my $cos_a = cos($angle_rad);
					my $sin_a = sin($angle_rad);

					# Create matrices for each step
					my $matrix_translate_to_origin = [ 1, 0, 0, 1, -$center_x, -$center_y ];
					my $matrix_rotate_at_origin    = [ $cos_a, $sin_a, -$sin_a, $cos_a, 0, 0 ];
					my $matrix_translate_back      = [ 1, 0, 0, 1, $center_x, $center_y ];

					# Apply them in reverse order of operation (because node coords are modified in place):
					# Or rather, think of it as T_back * (R_origin * (T_origin * Point))
					# Since transform_node modifies the point, we apply T_origin, then R_origin, then T_back.
					transform_node($node, $matrix_translate_to_origin, $mode);
					transform_node($node, $matrix_rotate_at_origin, $mode);
					transform_node($node, $matrix_translate_back, $mode);
				}
				elsif ($transform_attr_val =~ /^translate\s*\(\s*(-?\d*(?:\.\d*)?)[, ]+(-?\d*(?:\.\d*)?)\s*\)\s*rotate\s*\(\s*(-?\d*(?:\.\d*)?)\s*\)\s*$/)
				{
					# Handles a specific sequence: translate THEN rotate.
					# NOTE: Order matters for matrix multiplication. T * R is different from R * T.
					# Here, it implies the object is first rotated, then translated in the new rotated frame.
					# To apply to points (P' = T * R * P): apply R first, then T.
					my $tx = $1;
					my $ty = $2;
					my $angle_deg = $3;
					my $angle_rad = $angle_deg * pi / 180;
					my $cos_a = cos($angle_rad);
					my $sin_a = sin($angle_rad);

					my $matrix_translate = [ 1, 0, 0, 1, $tx, $ty ];
					my $matrix_rotate    = [ $cos_a, $sin_a, -$sin_a, $cos_a, 0, 0 ];

					# Apply rotation first, then translation to the (now modified) node.
					transform_node($node, $matrix_rotate, $mode);
					transform_node($node, $matrix_translate, $mode);
				}
				else
				{
					die $reverse."unsupported transform $transform_attr_val".$normal;
				}
			} # end if ($transform_attr_val)
			$current_element_for_transform_scan = $current_element_for_transform_scan->parentNode(); # Move to parent.
		} # end while (walking up the tree)

		# After applying inherited transforms, the $node's coordinates are "flattened" relative to the SVG canvas.
		# Now, perform some geometry cleaning.

		my $original_type = lc $node->nodeName(); # Node type might have changed (e.g. rect to polygon).

		# For polygons and polylines:
		if ($original_type eq "polygon" || $original_type eq "polyline")
		{
			my $points_str = $node->getAttribute("points");
			$points_str =~ s/\s+/ /g;        # Normalize spaces.
			$points_str =~ s/(^\s+|\s+$)//g; # Trim.
			# Convert "x1 y1 x2 y2" to "x1,y1 x2,y2" (if not already)
			$points_str =~ s/(?:^|(?<= ))(-?\d*(?:\.\d+)?) +(-?\d*(?:\.\d+)?)(?:$|(?= ))/$1,$2/g;

			my $last_point_coords;
			my $threshold = 0.4; # Minimum distance between consecutive points.
			# `grep` filters an array. Here it removes points too close to the previous one.
			my @points_list_of_xy_arrays = grep {
				my $current_point_is_ok = (!$last_point_coords || abs($last_point_coords->[0]-$_->[0]) > $threshold || abs($last_point_coords->[1]-$_->[1]) > $threshold ) ? 1 : 0;
				$last_point_coords = $_; # Update last point for next iteration.
				$current_point_is_ok;    # Return true to keep this point, false to discard.
			} map { [ split /,/,$_ ] } split /\s+/, $points_str; # Convert "x,y" strings to [x,y] arrays.

			# For polygons (not itineraries), if the last point is very close to the first, remove the last one (implicitly closed).
			if (scalar(@points_list_of_xy_arrays) >= 2 && $original_type eq "polygon" && !($mode && $mode eq "itinerary"))
			{
				my $last_pt_in_list  = $points_list_of_xy_arrays[$#points_list_of_xy_arrays]; # $#array gives last index
				my $first_pt_in_list = $points_list_of_xy_arrays[0];
				if (abs($last_pt_in_list->[0] - $first_pt_in_list->[0]) <= $threshold && abs($last_pt_in_list->[1] - $first_pt_in_list->[1]) <= $threshold)
				{
					pop @points_list_of_xy_arrays; # Remove last element.
				}
			}

			# Filter out very small or degenerate shapes.
			if ($mode && ($mode eq "itinerary" || $mode eq "furniture"))
			{ # For itineraries/furniture, need at least 2 points for a line segment.
				if (scalar(@points_list_of_xy_arrays) < 2)
				{
					print STDERR "Skipping ".$node->toString.": single point or less\n";
					return (); # Return empty list, effectively skipping this node.
				}
			}
			else # For other polygons (rooms, areas)
			{
				if (scalar(@points_list_of_xy_arrays) <= 2) # Polygons need at least 3 points.
				{
					print STDERR "Skipping ".$node->toString.": 2 points or less\n";
					return ();
				}
				# Filter out "sliver" polygons (very small area compared to perimeter).
				my $area = polygon_area(\@points_list_of_xy_arrays); # Pass reference to array of arrays.
				my $perimeter = polygon_perimeter(\@points_list_of_xy_arrays);
				my $ratio = ($perimeter > 0) ? ($area / $perimeter) : 0; # Avoid division by zero.
				if ($ratio < 0.2)
				{
					print STDERR "Skipping ".$node->toString.": area $area perimeter $perimeter -> ratio $ratio\n";
					return ();
				}
			}

			# If it was a polygon but is now an itinerary, convert to polyline and explicitly re-add first point at end to close it.
			if ($mode && $mode eq "itinerary" && $original_type eq "polygon")
			{
				$node->setNodeName("polyline"); # Change type.
				push @points_list_of_xy_arrays, $points_list_of_xy_arrays[0] if @points_list_of_xy_arrays; # Add first point to end.
			}
			# Update the 'points' attribute with cleaned points.
			$node->setAttribute("points", join(" ", map {join(",",@$_)} @points_list_of_xy_arrays));
		} # end if polygon/polyline cleaning

		# For paths:
		if ($original_type eq "path")
		{
			my $path_d_attr = $node->getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "original-d") || $node->getAttribute("d");
			# Check if path is just a single point "M x,y" or "m dx,dy" - often an artifact.
			if ($path_d_attr =~ /^[mM]\s*(-?\d*(?:\.\d*)?)(?:,|(?=[-.]))(-?\d*(?:\.\d*)?)$/)
			{
				print STDERR "Skipping ".$node->toString().": single point path\n";
				return ();
			}
		}

		# Apply the global "calage" transform, if defined.
		# This scales and translates the entire drawing to fit the predefined calage box.
		if ($global_transform)
		{
			transform_node($node, $global_transform, $mode); # Re-call transform_node with the global matrix.
                                                         # This will apply it to the already flattened coordinates.
            # The 'if(0)' block below contains redundant code that was likely part of an earlier implementation
            # of applying the global transform before transform_node was sophisticated enough or was called recursively.
            # It's correctly disabled.
		}

		# The node type might have changed again (e.g., from path to polyline by transform_node,
		# or polygon to polyline by itinerary mode). Get the final type.
		my $final_type = lc $node->nodeName();
		if ($final_type eq "polygon" && $mode && $mode eq "itinerary")
		{
			$node->setNodeName("polyline");
			$final_type = "polyline";
		}

		# Construct the JSON-like hash for this element.
		my $output_hash = {
			type =>	$final_type,
			# map over a list of attribute names.
			# For each attribute name, get its value from the node.
			# If value is defined and not empty, add (attr_name, value) to the hash.
			# Also, coerce numeric attributes to numbers.
			(map
			{
				my $attr_name = $_;
				my $attr_val = $node->getAttribute($attr_name) // ""; # `// ""` default to empty string if null.

				if (!defined $attr_val || $attr_val eq "")
				{
					(); # Return empty list: effectively skip this attribute.
				}
				else
				{
					$attr_val =~ s/\s+/ /g;  # Normalize whitespace within attribute value.
					$attr_val =~ s/(^ | $)//g; # Trim leading/trailing space.
					if ($attr_name =~ /^(x|y|width|height|x1|x2|y1|y2)$/)
					{
						$attr_val = $attr_val + 0; # Convert to number (e.g., "10.5" -> 10.5).
					}
					($attr_name, $attr_val); # Return key-value pair for the hash.
				}
			} ("id","name","class","showBubble","bubbleSide","offsetX","offsetY","scale", # Common attributes
			   @{$attrs_per_type{$final_type} // [] } # Type-specific geometric attributes (e.g., 'points' for polygon)
                                                      # `@{$hash{$key} // []}` provides an empty list if type not in map, avoiding errors.
			)), # End of map that generates key-value pairs.
		};
		return $output_hash;
	} # end sub svg_node_to_json

	# --- Main Processing Logic for the SVG file ---

	# Find the "Calage" (alignment) rectangle in the SVG.
	# XPath: Find <rect> elements that are children of <g id="Calage"> or <g inkscape:label="Calage">,
	# OR <rect> elements with id="Calage" directly.
	my @calage_rect_nodes = $xpc->findnodes('(//svg:g[@id="Calage" or @inkscape:label="Calage"]//svg:rect|//svg:rect[@id="Calage"])', $svg->documentElement());
	# `$svg->documentElement()` gets the root <svg> element.

	if (@calage_rect_nodes == 1 && defined $nx && defined $ny && defined $nw && defined $nh)
	{
		# If exactly one Calage rect is found in SVG AND target calage dimensions ($nx, etc.) are defined.
		my $svg_calage_rect_node = $calage_rect_nodes[0];
		# Process this SVG calage rect to flatten its own potential transforms.
		# Note: The result of svg_node_to_json isn't directly used here, but calling it populates
		# the attributes of $svg_calage_rect_node with flattened coords.
		my $processed_svg_calage_data = svg_node_to_json($svg_calage_rect_node); # This call modifies $svg_calage_rect_node
		# Now, get the actual (flattened) coordinates of the SVG's calage rectangle.
		my $x1_svg = +$svg_calage_rect_node->getAttribute("x"); # `+` prefix ensures numeric conversion.
		my $y1_svg = +$svg_calage_rect_node->getAttribute("y");
		my $w_svg  = +$svg_calage_rect_node->getAttribute("width");
		my $h_svg  = +$svg_calage_rect_node->getAttribute("height");
		my $x2_svg = $x1_svg + $w_svg;
		my $y2_svg = $y1_svg + $h_svg;

		print STDERR "calage in SVG: ".join(",",$x1_svg, $y1_svg, $w_svg, $h_svg)."\n";
		print STDERR "calage target: ".join(",",$nx, $ny, $nw, $nh)."\n";

		# Calculate scale factors and translations to map the SVG calage rect to the target calage rect.
		my $scale_x = $nw / $w_svg; # Target width / SVG width
		my $scale_y = $nh / $h_svg; # Target height / SVG height

		# Global transform matrix [a, b, c, d, e, f]
		# x' = a*x + c*y + e
		# y' = b*x + d*y + f
		# Here, a = scale_x, d = scale_y. b=0, c=0 (no rotation/skew from calage itself).
		# e = nx - x1_svg * scale_x  (target_x = x1_svg * scale_x + translate_x)
		# f = ny - y1_svg * scale_y  (target_y = y1_svg * scale_y + translate_y)
		$global_transform = [
			$scale_x,      # a
			0,             # b
			0,             # c
			$scale_y,      # d
			$nx - $x1_svg * $scale_x, # e (translateX)
			$ny - $y1_svg * $scale_y, # f (translateY)
		];
	}
	# --- Hardcoded global transforms for specific site/floor combinations ---
	# These are fallbacks or overrides if the Calage rectangle logic isn't used or is insufficient.
	# XXX: These are highly specific and indicate data issues in the source SVGs or complex requirements.
	elsif (0 && $site eq "PCA-DRA" && $floor eq "0") # This one is disabled with `0 &&`
	{
		# ... example of a rotate and scale transform ...
	}
	# ... more elsifs for other specific sites ...
	elsif ($site eq "IFP-PAR-RAP" && $floor eq "15")
	{
		warn "Translating for IFP-PAR-RAP floor 15";
		my $scale = 1;
		$global_transform = [ $scale, 0, 0, $scale, -20, 15 ]; # Simple translation
	}
	else # Default if no calage rect found and no specific hardcoded transform applies.
	{
		warn "Calage not found or not applicable for $site-$floor. Using identity transform.";
		$global_transform = [ 1, 0, 0, 1, 0, 0 ]; # Identity matrix (no change).
	}
	use Data::Dumper; # Make Dumper available (if not already).
	print STDERR Dumper({global_transform_matrix => $global_transform}); # Debug: print the calculated global transform.

	# --- Extract different layers/categories of SVG elements ---

	# Background elements
	# XPath: Find rect, path, or polygon elements under <g id="Contour"> or <g inkscape:label="Contour">.
	my @background_nodes = $xpc->findnodes('//svg:g[@id="Contour" or @inkscape:label="Contour"]//*[self::svg:rect or self::svg:path or self::svg:polygon]', $svg->documentElement());
	# `map { svg_node_to_json($_) } @background_nodes` processes each found node.
	$data->{background}=[ grep {$_} map {svg_node_to_json($_)} @background_nodes ];
    # `grep {$_}` filters out any empty results from svg_node_to_json (if a node was skipped).

	# Decor elements (similar to background)
	my @decor_nodes = $xpc->findnodes('//svg:g[@id="Decor" or @inkscape:label="Decor"]//*[self::svg:rect or self::svg:path or self::svg:polygon]', $svg->documentElement());
	$data->{decor}=[ grep {$_} map {svg_node_to_json($_)} @decor_nodes ];

	# Itinerary lines (corridor lines for navigation)
	# XPath: Finds line, polyline, polygon, or path under <g id="Lignes_de_couloir"> or <g inkscape:label="Lignes de couloir">.
	my @itineraries_nodes = $xpc->findnodes('//svg:g[@id="Lignes_de_couloir" or @inkscape:label="Lignes de couloir"]//*[self::svg:line or self::svg:polyline or self::svg:polygon or self::svg:path]', $svg->documentElement());
    # The 'if(0)' block contains site-specific commented-out tweaks, ignore for general understanding.
	# Process each itinerary node, passing "itinerary" mode to svg_node_to_json.
	# This mode influences how paths are closed and if polygons become polylines.
	# Also, `delete $_->{"class"}` would remove any 'class' attribute from the resulting JSON object for itineraries if it were outside the map.
    # Corrected structure:
    my @processed_itineraries;
    for my $it_node (@itineraries_nodes) {
        my $json_obj = svg_node_to_json($it_node, "itinerary");
        if ($json_obj) {
            delete $json_obj->{"class"}; # Remove class attribute if it exists on the JSON object
            push @processed_itineraries, $json_obj;
        }
    }
    $data->{itineraries} = \@processed_itineraries;


	# POIs (Points of Interest - Rooms, Offices, etc.)
	# XPath: Finds any element (*) under <g> elements typically named "Salles", "Pièces", etc.
	my @poi_nodes = $xpc->findnodes('//svg:g[@id="Salles" or @id="Pièces" or @id="pièces" or @inkscape:label="Salles" or @inkscape:label="Pièces" or @inkscape:label="pièces"]//*', $svg->documentElement());
	print STDERR "Found ".scalar(@poi_nodes)." POI candidate elements\n";

	$data->{pois}	=	{}; # POIs will be stored in a hash, categorized by class (e.g., $data->{pois}{office}{"Office101"} = {...})

	my %seen_poi_ids; # To track duplicate POI IDs.
	# `%id_fixes` is a large hardcoded hash for site-specific corrections to POI IDs.
	# This is a common sign of data cleaning needs due to inconsistencies in source SVGs.
	# Example: $id_fixes{"BRU-7"}{"Ascenseur"} = "Ascenseur_x-left";
	# This means if site is "BRU", floor is "7", and an element has ID "Ascenseur",
	# its ID will be changed to "Ascenseur_x-left" before further processing.
	# The "_x-left" suffix is a convention used later to control bubble placement.
	my %id_fixes = ( # ... definition of id_fixes hash as in the script ...
        "CRO-3" => {
            "Salle_de_réunion_3S_Turenne" => "Salle_de_réunion_3S_Turenne_x-left",
            "Escalier_2" => "Escalier_2_x-left",
            "Ascenseur_3" => "Ascenseur_3_x-left",
        },
    );
	my %other_fixes = ( # Another hardcoded hash for fixing attributes other than ID.
        # ... definition of other_fixes ...
    );
	my $id_fixes_for_current_sitefloor = $id_fixes{"$site-$floor"}; # Get fixes relevant to current file.
	# use Data::Dumper; print STDERR Dumper($id_fixes_for_current_sitefloor); # Debugging.

	for my $poi_node (@poi_nodes)
	{
		my $original_id_attr = $poi_node->getAttribute("id");
		next if !$original_id_attr; # Skip if node has no ID.

		my $current_id = $original_id_attr;
		my $display_name; # For things like meeting rooms, where ID might be technical, name is user-friendly.

		# Prefer 'data-name' attribute if it's a "cleaner" version of the ID.
		my $data_name_attr = $poi_node->getAttribute("data-name");
		if ($data_name_attr) {
			my $data_name_simplified = $data_name_attr;
			$data_name_simplified =~ s/[, ]+/_/g; # Replace commas/spaces with underscores.
			if ($data_name_simplified eq $current_id) { # If simplified data-name matches current ID
				$current_id = $data_name_attr; # Use the original data-name (with spaces/commas) as the ID.
			}
		}

		# Prefer 'inkscape:label' if it starts with "override ".
		my $inkscape_label = $poi_node->getAttributeNS("http://www.inkscape.org/namespaces/inkscape","label");
		if ($inkscape_label && $inkscape_label =~ /^override\s+(.*)$/i) {
			$current_id = $1; # Use the part after "override " as the ID.
		}
		# Or if ID is generic (like "path1234") and label exists, use label.
		elsif ($inkscape_label && $current_id =~ /^path[-_\s\d]+$/) {
			$current_id = $inkscape_label;
		}
		$current_id =~ s/_$//; # Remove trailing underscore from ID.

		# Apply attribute fixes from %other_fixes
		my $attr_fixes_for_id = $other_fixes{"$site-$floor"}{$current_id};
		if ($attr_fixes_for_id) {
			for my $attr_to_fix (keys %$attr_fixes_for_id) {
				$poi_node->setAttribute($attr_to_fix, $attr_fixes_for_id->{$attr_to_fix});
			}
		}

		# Apply ID fixes from %id_fixes
		if ($id_fixes_for_current_sitefloor && $id_fixes_for_current_sitefloor->{$current_id}) {
			print STDERR "ID fix: $current_id -> $id_fixes_for_current_sitefloor->{$current_id}\n";
			$current_id = $id_fixes_for_current_sitefloor->{$current_id};
		}

		# Decode "URL-encoded" underscores like "_x2F_" back to characters (e.g., "/" for _x2F_).
		$current_id =~ s/_x([0-9a-f]{2})_/sprintf("%c", hex($1))/egi;
		# `hex($1)` converts hex string (like "2F") to number. `sprintf("%c", ...)` converts number to char.
		# `e` flag allows code execution in replacement, `g` global, `i` case-insensitive.

		$current_id =~ s/_/ /g; # Replace remaining underscores with spaces. This makes IDs more readable.

		if (exists $seen_poi_ids{$current_id}) {
			print STDERR "${reverse}Duplicate POI id $current_id${normal}\n"; # Warn about duplicates.
            # Could add logic here to skip or rename, but script currently proceeds.
		}
		$seen_poi_ids{$current_id} = 1; # Mark ID as seen.

		# Parse special suffixes from ID for bubble placement and offsets.
		# Example ID: "Office A_x-left_x-offsetX_10_x-offsetY_-5"
		if ($current_id =~ s/ +x-(left|tl|tr|bl|br)//) { # Matches " x-left", " x-tl", etc.
			# $1 has "left", "tl", etc. This is removed from $current_id.
			$poi_node->setAttribute("bubbleSide", $1); # Store as attribute on the node.
		}
		while ($current_id =~ s/ +x-(offset[XY]|scale) (-?\d+(?:\.\d+)?)//i) { # Matches " x-offsetX 10", " x-scale 1.5"
			# $1 is "offsetX", "offsetY", or "scale". $2 is the value.
			# These are removed from $current_id.
			$poi_node->setAttribute($1, $2); # Store as attribute on the node.
		}

		# --- Classify POI based on its (now cleaned) ID ---
		my $poi_class = "other"; # Default class.
		# A series of if/elsif statements with regexes to determine the type of POI.
		# This is highly domain-specific.
		if ($current_id =~ /^Terrasse.*/i) { $poi_class = "terrace"; }
		elsif ($current_id =~ /^Bureaux? (.*)$/i) { # "Bureau X", "Bureaux Y"
			$poi_class = "office";
			$current_id = $1; # $current_id becomes just "X" or "Y".
			# Further cleaning of office numbers:
			$current_id =~ s/ 1 ?$//g;    # Remove " 1 " suffix.
			$current_id =~ s/ +- +/,/g;    # " - " -> ","
			$current_id =~ s/ +et +/,/g;   # " et " -> ","
			$current_id =~ s/([0-6][GS])-([0-9]+)/$1$2/g; # "6G-28" -> "6G28"
			$current_id =~ s/ //g;        # Remove spaces.
		}
		# ... many more elsif for "Openspace", "Salle de réunion", "WC", "Ascenseur", etc. ...
        elsif ($current_id =~ /^Salle de r(?:é|  )ui?nion ([-.\w'’\/ ]+)$/i) {
            $poi_class = "meeting-room";
            $display_name = $1; # The part after "Salle de réunion " becomes the display name.
            my $clean_name_for_map_lookup = lc NFD($display_name);
            $clean_name_for_map_lookup =~ s/\pM//g;       # remove diacritics
            $clean_name_for_map_lookup =~ s/\W//g;        # remove non-word chars
            $clean_name_for_map_lookup =~ s/(^\s*|\s*$)//g; # trim
            if ($meeting_rooms_map{$clean_name_for_map_lookup}) {
                $current_id = $meeting_rooms_map{$clean_name_for_map_lookup}; # Use ID from map file.
            } else {
                print $reverse."no mapping for meeting room '$display_name' (cleaned: '$clean_name_for_map_lookup')".$normal."\n";
                $current_id = $display_name; # Fallback to using the name as ID if no map entry.
            }
        }
		# ... (other classifications) ...
		elsif ($id =~ /^(flat-[0-9a-f]{6}) (.*)/i) # ID starts with "flat-RRGGBB " (color code)
		{
			$poi_class = $1; # Use "flat-RRGGBB" as class.
			$current_id = $2; # The rest is the ID.
		}
		else { # If no specific rule matches.
			print STDERR "${reverse}unknown POI type for ID: '$current_id' (original: '$original_id_attr')$normal\n";
			$poi_class = "other"; # Default fallback.
		}

		# If it's a meeting room or "espace", the $current_id might have been set to a technical ID
		# from the salles-name-to-id map, and $display_name holds the human-readable name.
		# (Logic for this was partially shown in the "Salle de réunion" example above)
		# The script structure for this seems a bit spread out, ensure $display_name is set correctly when $current_id changes.

		# Prepare the node for svg_node_to_json:
		# Skip if it's a <rect> with no width or height (often an error in SVG).
		if (lc $poi_node->nodeName() eq "rect" && (!$poi_node->getAttribute("width") || !$poi_node->getAttribute("height"))) {
			print STDERR "ignoring POI rect with no width or height: $original_id_attr\n";
			next;
		}
		$poi_node->removeAttribute("id"); # Remove original 'id' (might be on a <g>)
		$poi_node->removeAttribute("clip-path");
		$poi_node->removeAttribute("fill");
		# Set the cleaned/processed attributes that will be used by svg_node_to_json:
		$poi_node->setAttribute("id", $current_id);
		$poi_node->setAttribute("name", $display_name) if $display_name; # Set 'name' if we have one.
		$poi_node->setAttribute("class", $poi_class) if $poi_class;

		# Ensure the $data->{pois}{$poi_class} hash exists.
		$data->{pois}{$poi_class} //= {}; # Defined-or assignment: if LHS is undef, assign RHS.
		                                  # JS: `data.pois[poi_class] = data.pois[poi_class] || {};`

		my $json_poi_object = svg_node_to_json($poi_node); # Convert the (modified) SVG node to JSON structure.
		if ($json_poi_object && defined $json_poi_object->{type}) { # Check if object is valid.
            # Store it: $data->{pois}{office}{"Office101"} = { type: "polygon", ... }
			$data->{pois}{$poi_class}{$current_id} = $json_poi_object;
		}
	} # end loop over POI nodes

	# --- Process Desks and Furniture ---
	# XPath: Find line, polyline, or path elements under <g> with ID/label "Mobilier".
	my @desk_candidate_nodes = $xpc->findnodes('//svg:g[@id="Mobilier" or @id="mobilier" or @id="MOBILIER" or @id="MOBILIERS" or @inkscape:label="Mobilier" or @inkscape:label="mobilier" or @inkscape:label="MOBILIER" or @inkscape:label="MOBILIERS"]//*[self::svg:line or self::svg:polyline or self::svg:path or self::svg:rect]', $svg->documentElement());
    # Added svg:rect to match the processing below that handles rects.
	print STDERR "Found ".scalar(@desk_candidate_nodes)." desk/furniture candidate elements\n";

	$data->{desks}     = {}; # Will store structured desk info.
	$data->{furniture} = {}; # Will store other furniture.
    $data->{text}      = {}; # Will store text elements from furniture layer.
    $data->{tag}       = {}; # Will store tag elements from furniture layer.


	my %seen_desk_ids; # Track duplicate desk IDs.

	for my $desk_node (@desk_candidate_nodes) {
		my $original_id_attr = $desk_node->getAttribute("id");
        my $current_id = $original_id_attr;

		# Try to get a more meaningful ID from inkscape:label or parent <g> if current ID is generic.
		my $inkscape_label = $desk_node->getAttributeNS("http://www.inkscape.org/namespaces/inkscape","label");
		if ($inkscape_label && $inkscape_label =~ /^override\s+(.*)$/i) {
			$current_id = $1;
		}
		elsif ($inkscape_label && $current_id =~ /^path[-_\s\d]+$/i) { # path, path-123, etc.
			$current_id = $inkscape_label;
		}
		next if !$current_id; # Skip if no usable ID.

        # If ID is still generic like "line123" or "g456", try to find ID from an ancestor <g> node
        # up to (but not including) the main "Mobilier" group.
		if ($current_id =~ /^(line|g)\d*$/i || $current_id =~ /^rect\d*$/i) {
			my $parent_walker = $desk_node->parentNode;
			my $found_better_id = 0;
			while ($parent_walker && lc $parent_walker->nodeName eq 'g') {
				my $parent_id = $parent_walker->getAttribute("id");
				if ($parent_id && $parent_id !~ /^(line|g)\d*$/i && $parent_id !~ /^mobilier$/i) {
					$current_id = $parent_id;
					$found_better_id = 1;
					last;
				}
                # Stop if we reached the main Mobilier group
                if ($parent_id && $parent_id =~ /^mobilier$/i) { last; }
				$parent_walker = $parent_walker->parentNode;
			}
            if (!$found_better_id && $current_id =~ /^(line|g|rect)\d*$/i) {
                #print STDERR "Skipping furniture with generic ID: $original_id_attr\n";
                next; # Still generic, skip.
            }
		}

		$current_id =~ s/_$//; # Remove trailing underscore.
		# print STDERR "Processing furniture ID: $current_id (original: $original_id_attr)\n"; # Debug
		$current_id =~ s/_x([0-9a-f]{2})_/sprintf("%c", hex($1))/egi; # Decode _xXX_
		$current_id =~ s/_/ /g; # Underscore to space.

		if (exists $seen_desk_ids{$current_id}) {
			print STDERR "${reverse}Duplicate desk/furniture id $current_id${normal}\n";
            # Potentially skip or rename
		}
		$seen_desk_ids{$current_id} = 1;

		# --- Parse the structure of the desk/furniture ID ---
		my $item_class; # e.g., "desks", "meeting", "cupboard"
		my @objects_on_this_item = (); # For desks, list of actual workstations
		my $target_data_category; # "desks", "furniture", "text", "tag"
        my ($text_content, $text_font_size, $text_color, $text_is_vertical_alignment_top, $text_type_flag);
        my ($indicator_x_offset, $indicator_y_offset, $indicator_angle);


		# Regex to parse complex ID for desks/meeting tables:
		# Example: "SDR OfficeName:I+1.0-0.5A90:120x60:1GD=User1,2DX=User2"
		#          "Postes Room101:ABCD" (A,B are G; C,D are D)
		if ($current_id =~ /^(SDR|Postes?)\s+([-A-Z0-9. ]+)(?::I([-+]?\d+(?:\.\d)?)([-+]?\d+(?:\.\d)?)A(\d+))?(?::(\d+)x(\d+))?:\s*(.*)$/i) {
			my ($type_tag, $location_name, $raw_ix, $raw_iy, $raw_ia, $item_width, $item_depth, $desk_specifiers_str) = ($1, $2, $3, $4, $5, $6, $7, $8);

			$item_class = (uc $type_tag eq "SDR") ? "meeting" : "desks";
            $target_data_category = "desks"; # Both SDR and Postes go into $data->{desks}

            $indicator_x_offset = $raw_ix ? $raw_ix+0 : undef;
            $indicator_y_offset = $raw_iy ? $raw_iy+0 : undef;
            $indicator_angle    = $raw_ia ? $raw_ia+0 : undef;

			# Parse individual desk specifiers
			if ($desk_specifiers_str =~ /=/) { # Format: "1G=UserA,2D=UserB"
				my @specs = split /\s*,\s*/, $desk_specifiers_str;
				for my $spec (@specs) {
					if ($spec =~ /^(\d+)([GD]X?|C)=(.+)$/i) { # Position (1), Side (G/D/GX/DX/C), ID (User)
						my $obj = { position => $1, side => uc $2, office => $location_name, desk => $3 };
						if ($item_width && $item_depth) {
							$obj->{width} = 0+$item_width; $obj->{depth} = 0+$item_depth;
						}
						push @objects_on_this_item, $obj;
					} else { die "Could not match desk spec '$spec' in ID '$current_id'"; }
				}
			} else { # Format: "ABCD" or "-N4" (layout codes)
				my @desk_ids_ordered;
                # -: reverse, U/N/R/Z: layout, number: count
				if ($desk_specifiers_str =~ /^(-?)([URNZ]?)(\d+)$/) {
					my $reverse_order = ($1 eq '-');
					my $layout_code = $2 || 'Z'; # Default to Z (zigzag)
					my $count = $3;
					my $next_char_code = ord('A');
					if ($layout_code eq 'Z') { # A, B, C, D...
						@desk_ids_ordered = map { chr($next_char_code++) } (1 .. $count);
					} elsif ($layout_code eq 'N') { # A, C, B, D... (for N-shape seating)
                        @desk_ids_ordered = map { chr(ord('A') + ($_%2) * ($count/2) + ($_ >> 1)) } (0 .. ($count-1));
					} elsif ($layout_code eq 'R') { # B, D, A, C... (reverse N-shape)
                        @desk_ids_ordered = map { chr(ord('A') + (($_+1)%2) * ($count/2) + ($_ >> 1)) } (0 .. ($count-1));
                    } # U (U-shape) might need more complex logic or is handled as Z.
					if ($reverse_order) { @desk_ids_ordered = reverse @desk_ids_ordered; }
				} else { # Simple sequence like "ABCD"
					@desk_ids_ordered = split //, $desk_specifiers_str;
				}

				my $desk_idx = 0;
				for my $desk_char_id (@desk_ids_ordered) {
					if ($desk_char_id ne '-') { # '-' can be a placeholder for an empty spot.
						my $obj = {
							position => ($desk_idx >> 1) + 1, # Integer division by 2, then +1 (0,1 -> 1; 2,3 -> 2)
							side => ($desk_idx % 2) ? "D" : "G", # 0,2,4... -> G; 1,3,5... -> D
							office => $location_name,
							desk => $desk_char_id
						};
						if ($item_width && $item_depth) {
							$obj->{width} = 0+$item_width; $obj->{depth} = 0+$item_depth;
						}
						push @objects_on_this_item, $obj;
					}
					$desk_idx++;
				}
			}
		}
		elsif ($current_id =~ /^meuble\s+([-_\w]+)/i) { # "meuble cupboard", "meuble printer_station"
			$item_class = $1;
			$target_data_category = "furniture";
		}
		elsif ($current_id =~ /^tag\s+([-_\w]+)/i) { # "tag entrance", "tag exit"
            $item_class = $1;
            $target_data_category = "tag";
        }
		elsif ($current_id =~ /^(r?text)(-top)?\s+(\S+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s(.*)$/) {
            # "text style size color content" or "rtext..." (rotated) or "...-top" (alignment)
			$target_data_category = "text";
            ($text_type_flag, my $align_top_flag, $item_class, $text_font_size, $text_color, $text_content) = ($1, $2, $3, $4, $5, $6);
            $text_is_vertical_alignment_top = ($align_top_flag && $align_top_flag eq "-top");
			$text_content =~ s/\\n/\n/g; # Allow \n for newlines in text.
		}
		else {
			print STDERR "${reverse}unknown desk/furniture ID format: '$current_id' (original: '$original_id_attr')$normal\n";
			next; # Skip this item.
		}

        # Prepare the SVG node itself (line, polyline, path, or rect)
		if (lc $desk_node->nodeName() eq "rect" && (!$desk_node->getAttribute("width") || !$desk_node->getAttribute("height"))) {
			print STDERR "ignoring furniture rect with no width or height: $current_id\n";
			next;
		}
		$desk_node->removeAttribute("id"); # Clear attributes that will be set in the JSON object.
		$desk_node->removeAttribute("clip-path");
		$desk_node->removeAttribute("fill");
		$desk_node->setAttribute("id", $current_id); # Temporarily set ID for svg_node_to_json if it needs it.

        # Process the geometry. For desks/furniture, this often defines a baseline or orientation.
        # 'furniture' mode in svg_node_to_json might have specific handling.
		my $json_geometry_obj = svg_node_to_json($desk_node, "furniture");
        if (!$json_geometry_obj || !defined $json_geometry_obj->{type}) {
            print STDERR "Skipping furniture '$current_id' due to invalid geometry after processing.\n";
            next;
        }

        # Extract start point and direction from the (now transformed) geometry.
        # This typically expects a line or a 2-point polyline/polygon representing the "front" or "axis" of the furniture.
		my ($p1_coords, $p2_coords); # Will be [x,y] array refs
        my $item_direction_rad = 0;

		my $geom_type = $json_geometry_obj->{type};
		if ($geom_type eq "polyline" || $geom_type eq "polygon") {
            my @points_arr = split / /, $json_geometry_obj->{points};
            if (@points_arr >= 2) {
                $p1_coords = [split /,/, $points_arr[0]];
                $p2_coords = [split /,/, $points_arr[1]];
            } elsif (@points_arr == 1 && $geom_type eq "polygon") { # A single point "polygon" (likely a converted rect that was tiny)
                $p1_coords = [split /,/, $points_arr[0]];
                $p2_coords = $p1_coords; # No direction
            } else {
                print STDERR "${reverse}Furniture '$current_id' of type $geom_type needs at least 2 points, has ".scalar(@points_arr).". Points: '$json_geometry_obj->{points}'${normal}\n";
                next;
            }
        } elsif ($geom_type eq "line") {
            $p1_coords = [$json_geometry_obj->{x1}, $json_geometry_obj->{y1}];
            $p2_coords = [$json_geometry_obj->{x2}, $json_geometry_obj->{y2}];
        } elsif ($geom_type eq "rect") { # For rects, use top-left as p1, top-right as p2 (defines width direction)
            $p1_coords = [$json_geometry_obj->{x}, $json_geometry_obj->{y}];
            $p2_coords = [$json_geometry_obj->{x} + $json_geometry_obj->{width}, $json_geometry_obj->{y}];
            # Can also store width/height if needed for this furniture type
            $json_geometry_obj->{w_val} = $json_geometry_obj->{width};
            $json_geometry_obj->{h_val} = $json_geometry_obj->{height};
        }
        else {
            print STDERR "${reverse}Unsupported geometry type '$geom_type' for furniture '$current_id'${normal}\n";
            next;
        }

        # Calculate direction from p1 to p2
        if ($p1_coords && $p2_coords && !($p1_coords->[0] == $p2_coords->[0] && $p1_coords->[1] == $p2_coords->[1])) {
    		$item_direction_rad = atan2($p2_coords->[1] - $p1_coords->[1], $p2_coords->[0] - $p1_coords->[0]);
        }

		# Construct the final object for this item
		my $output_item_obj = {
			id        => $current_id,
			class     => $item_class,
			point     => $p1_coords, # Anchor point (often start of the line)
			direction => $item_direction_rad, # Radians
            # original_svg_type => $geom_type, # For debugging
            # original_svg_geom => $json_geometry_obj, # For debugging
		};
        # Add specific fields based on category
        if ($target_data_category eq "desks") {
    		$output_item_obj->{objects} = \@objects_on_this_item if @objects_on_this_item; # List of workstations
            $output_item_obj->{indicator_x} = $indicator_x_offset if defined $indicator_x_offset;
            $output_item_obj->{indicator_y} = $indicator_y_offset if defined $indicator_y_offset;
            $output_item_obj->{indicator_a} = $indicator_angle    if defined $indicator_angle;
        } elsif ($target_data_category eq "text") {
            $output_item_obj->{text_type} = $text_type_flag; # "text" or "rtext"
            $output_item_obj->{text} = $text_content;
            $output_item_obj->{size} = $text_font_size + 0;
            $output_item_obj->{color} = $text_color;
            $output_item_obj->{valign_top} = $text_is_vertical_alignment_top ? 1:0;
        } elsif ($target_data_category eq "furniture" && $geom_type eq "rect" && $json_geometry_obj->{w_val} && $json_geometry_obj->{h_val}) {
            $output_item_obj->{width} = $json_geometry_obj->{w_val};
            $output_item_obj->{height} = $json_geometry_obj->{h_val};
        }
        # ... other category-specific fields ...

		$data->{$target_data_category}{$item_class} //= {};
		$data->{$target_data_category}{$item_class}{$current_id} = $output_item_obj;
	} # end loop over desk/furniture nodes


	# --- Output the collected data as JSON ---
	my $output_fh;
	open $output_fh, ">$output_filename" or die "can't open $output_filename for writing: $!";
	# `>` opens for writing, overwriting the file if it exists.
	binmode $output_fh, ":utf8"; # Ensure UTF-8 output.

	# Use the JSON module to convert the Perl data structure ($data) to a JSON string.
	# `pretty => 1`: formats the JSON with indentation for readability.
	# `canonical => 1`: sorts keys in objects, ensuring consistent output for the same data.
	print $output_fh to_json($data, { pretty => 1, canonical => 1 });
	close $output_fh;
	print "Successfully generated $output_filename\n";

} # end main loop over input files (@ARGV)

print STDERR "Script finished.\n";
```

**Key Perl Concepts for a JS Developer:**

1.  **Sigils (`$`, `@`, `%`):**
    *   `$scalar`: Holds a single value (string, number, or a reference). Like `let myVar = ...;`
    *   `@array`: Ordered list of scalars. Like `let myArray = [...];`
    *   `%hash`: Unordered collection of key-value pairs (keys are strings, values are scalars). Like `let myObject = {...};` or `new Map()`.

2.  **References (`\`):**
    *   Perl uses references to create complex data structures (like an array of hashes, or a hash of arrays).
    *   `\` creates a reference: `\@array` is a reference to `@array`. `\%hash` is a reference to `%hash`. `{}` creates an anonymous hash reference. `[]` creates an anonymous array reference.
    *   `->`: Dereferencing operator for array/hash references and method calls on objects.
        *   `$array_ref->[0]`: Access first element of array via reference. (JS: `array[0]`)
        *   `$hash_ref->{key}`: Access hash value via reference. (JS: `object.key` or `object['key']`)
    *   `$$scalar_ref`, `@$array_ref`, `%$hash_ref`: Other ways to dereference.

3.  **`my`:** Declares lexically scoped variables (limited to the current block `{...}`). Like `let` or `const` in JS.

4.  **File Handling:**
    *   `open my $fh, "MODE", "filename"`: Opens a file. `$fh` is a file handle.
    *   `<$fh>`: Reads a line from the file handle.
    *   `close $fh`: Closes the file.
    *   `binmode $fh, ":utf8"`: Sets encoding.

5.  **Regex:**
    *   `$var =~ m/pattern/` or `$var =~ /pattern/`: Match regex.
    *   `$var =~ s/pattern/replacement/flags`: Substitute.
    *   `$1`, `$2`, etc.: Captured groups.
    *   `i`: case-insensitive, `g`: global, `e`: execute replacement as code.

6.  **Control Flow:**
    *   `if (...) { ... } elsif (...) { ... } else { ... }`
    *   `for my $var (@array) { ... }`: Loop through array elements.
    *   `while (CONDITION) { ... }`
    *   `next`: Like `continue` in JS.
    *   `last`: Like `break` in JS.
    *   `die "message"`: Terminate script with error. `warn "message"`: Print warning.

7.  **Operators:**
    *   `.`: String concatenation. (JS: `+`)
    *   `eq`, `ne`, `lt`, `gt`, `le`, `ge`: String comparison operators. (JS: `===`, `!==`, `<`, `>`, `<=`, `>=` often work for strings too, but Perl differentiates numeric vs string comparison).
    *   `==`, `!=`, `<`, `>`, `<=`, `>=`: Numeric comparison.
    *   `//`: Defined-or operator (if left is undefined, use right). (JS: `??` nullish coalescing).
    *   `||`: Logical OR (short-circuiting).
    *   `&&`: Logical AND (short-circuiting).

8.  **Subroutines (Functions):**
    *   `sub my_function_name { my $arg1 = shift; my $arg2 = shift; ... return $value; }`
    *   Arguments are passed in a special array `@_`. `shift` removes and returns the first element of `@_`.

9.  **Modules (`use ...;`):**
    *   Like `import` or `require` in JS. `XML::LibXML`, `JSON`, `Math::Trig` are external libraries providing functionality.

10. **`qw()` (Quote Words):**
    *   `qw(x y width height)` is a shortcut for `('x', 'y', 'width', 'height')`.

11. **`map { ... } LIST` and `grep { ... } LIST`:**
    *   `map`: Transforms each element of a list. (JS: `list.map(...)`)
    *   `grep`: Filters a list based on a condition. (JS: `list.filter(...)`)

This detailed breakdown should give a JS developer a good starting point for understanding this Perl script. The core logic involves a lot of string manipulation (especially parsing IDs and SVG path data), coordinate geometry, and data structure building. The most challenging parts are likely the SVG path parsing in `transform_node` and the various ID parsing regexes specific to the project's conventions.
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

ThemeData buildAppTheme() {
  const seed = Color(0xFF6F42C1); // similar purple tone from web
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: seed),
  );

  return base.copyWith(
    textTheme: GoogleFonts.notoSansKhmerTextTheme(base.textTheme).copyWith(
      headlineSmall:
          GoogleFonts.khmerMoul(textStyle: base.textTheme.headlineSmall),
      titleLarge: GoogleFonts.khmerMoul(textStyle: base.textTheme.titleLarge),
    ),
    appBarTheme: AppBarTheme(
      centerTitle: false,
      titleTextStyle: GoogleFonts.khmerMoul(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: base.colorScheme.onSurface,
      ),
    ),
  );
}

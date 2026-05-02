import 'package:flutter/material.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const [
        ListTile(
          leading: Icon(Icons.tune),
          title: Text('Indicators'),
          subtitle: Text('Phase 2'),
        ),
        ListTile(
          leading: Icon(Icons.apartment),
          title: Text('Departments'),
          subtitle: Text('Phase 2'),
        ),
        ListTile(
          leading: Icon(Icons.account_tree_outlined),
          title: Text('Units'),
          subtitle: Text('Phase 2'),
        ),
        ListTile(
          leading: Icon(Icons.calendar_month_outlined),
          title: Text('Periods'),
          subtitle: Text('Phase 2'),
        ),
        ListTile(
          leading: Icon(Icons.people_alt_outlined),
          title: Text('Users'),
          subtitle: Text('Phase 2 (SUPER only)'),
        ),
      ],
    );
  }
}

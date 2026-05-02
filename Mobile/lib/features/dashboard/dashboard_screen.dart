import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../app/widgets/app_scaffold.dart';
import '../data_entry/data_entry_screen.dart';
import '../reports/reports_screen.dart';
import '../settings/settings_screen.dart';

class DashboardShell extends StatefulWidget {
  const DashboardShell({super.key});

  @override
  State<DashboardShell> createState() => _DashboardShellState();
}

class _DashboardShellState extends State<DashboardShell> {
  int _idx = 0;

  final _tabs = const [
    _Tab('ផ្ទាំងគ្រប់គ្រង', DashboardScreen()),
    _Tab('របាយការណ៍', ReportsScreen()),
    _Tab('បញ្ចូលទិន្នន័យ', DataEntryScreen()),
    _Tab('កំណត់', SettingsScreen()),
  ];

  @override
  Widget build(BuildContext context) {
    final tab = _tabs[_idx];

    return AppScaffold(
      title: tab.title,
      actions: [
        IconButton(
          tooltip: 'Logout',
          onPressed: () async {
            await FirebaseAuth.instance.signOut();
            if (!mounted) return;
            Navigator.of(context).pushReplacementNamed('/login');
          },
          icon: const Icon(Icons.logout),
        ),
      ],
      body: tab.body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _idx,
        onDestinationSelected: (i) => setState(() => _idx = i),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.dashboard_outlined), label: 'ផ្ទាំង'),
          NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined), label: 'របាយការណ៍'),
          NavigationDestination(
              icon: Icon(Icons.edit_note_outlined), label: 'បញ្ចូល'),
          NavigationDestination(
              icon: Icon(Icons.settings_outlined), label: 'កំណត់'),
        ],
      ),
    );
  }
}

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Placeholder: KPI cards (phase 2 will connect to Firestore)
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('សង្ខេប', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: const [
            _KpiCard(title: 'សរុប', value: '--'),
            _KpiCard(title: 'បានបញ្ចូល', value: '--'),
            _KpiCard(title: 'មិនទាន់បញ្ចូល', value: '--'),
          ],
        ),
        const SizedBox(height: 18),
        const Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Text('Chart placeholder (Phase 2)'),
          ),
        ),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.title, required this.value});
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 220,
      child: Card(
        elevation: 0,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title),
              const SizedBox(height: 8),
              Text(value, style: Theme.of(context).textTheme.headlineSmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tab {
  const _Tab(this.title, this.body);
  final String title;
  final Widget body;
}

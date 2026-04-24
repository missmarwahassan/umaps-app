# UMAPS Scholars Explorer

A comprehensive data visualization and exploration platform for the University of Michigan African Presidential Scholars (UMAPS) program. This application provides interactive dashboards for analyzing scholar data, engagement activities, publications, and program insights.

## 🌟 Features

- **Interactive Scholars Database**: Browse and search through UMAPS scholar profiles
- **Engagement Analytics**: Visualize engagement activities across African countries
- **Publications Dashboard**: Track and analyze scholarly publications
- **Data Insights**: Comprehensive analytics and program metrics
- **Web-based Interface**: Built with Streamlit for an intuitive user experience

## 🚀 Quick Start

### Prerequisites

- Python 3.8 or higher
- pip package manager

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd umaps_app
   ```

2. **Create and activate virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Build the database**:
   ```bash
   python build_db.py
   ```

5. **Run the application**:
   ```bash
   streamlit run app.py
   ```

The application will open in your web browser at `http://localhost:8501`

## 📊 Data Processing

The application includes several data export scripts:

- **`build_db.py`**: Processes alumni data and builds the main database
- **`export_engagement_data.py`**: Exports engagement data for visualization
- **`export_dashboard_data.py`**: Generates dashboard-specific datasets
- **`export_publications_data.py`**: Processes publications data

### Data Sources

- Alumni data from Excel files in the `data/` directory
- Qualtrics survey responses
- Engagement tracking data
- Publications metadata

## 🏗️ Project Structure

```
umaps_app/
├── app.py                    # Main Streamlit application
├── build_db.py              # Database building script
├── export_*.py              # Data export scripts
├── requirements.txt         # Python dependencies
├── umaps.db                # SQLite database (generated)
├── data/                   # Raw data files
├── docs/                   # Web dashboard files
│   ├── index.html         # Main dashboard
│   ├── engagement.html    # Engagement visualization
│   ├── publications.html  # Publications dashboard
│   └── insights.html      # Analytics insights
└── README.md              # This file
```

## 🛠️ Technology Stack

- **Backend**: Python, DuckDB, Pandas
- **Frontend**: Streamlit, HTML, JavaScript, CSS
- **Data Visualization**: Altair, Vega
- **Database**: DuckDB (SQLite-compatible)
- **Data Processing**: Pandas, OpenPyXL

## 📋 Dependencies

- `pandas` - Data manipulation and analysis
- `streamlit` - Web application framework
- `duckdb` - Database management
- `altair` - Data visualization
- `openpyxl` - Excel file processing
- `rapidfuzz` - String matching and fuzzy search
- `vega_datasets` - Visualization datasets
- `pycountry` - Country data and codes

## 🔧 Configuration

### Database Setup

The application requires a `umaps.db` database file. If the database doesn't exist, the application will prompt you to run `build_db.py` first.

### Data Files

Place your raw data files in the `data/` directory:
- `UMAPS Alumni Data-3.xlsx` - Main alumni dataset
- `UMAPS Alumni_February 28, 2026_22.02.xlsx` - Survey responses

## 🌍 Supported Countries

The application tracks engagement across all African countries including:

Algeria, Benin, Botswana, Burkina Faso, Cameroon, Congo, Republic of the Congo, Côte d'Ivoire, Democratic Republic of the Congo, Egypt, Ethiopia, Gabon, Ghana, Guinea, Guinea-Bissau, Kenya, Lesotho, Liberia, Libya, Madagascar, Malawi, Mali, Mauritania, Morocco, Mozambique, Namibia, Niger, Nigeria, Rwanda, Senegal, South Africa, Sudan, Tanzania, Togo, Tunisia, Uganda, Zambia, Zimbabwe

## 📈 Usage

1. **Browse Scholars**: Use the main interface to search and filter through scholar profiles
2. **View Engagement**: Explore engagement activities by country, region, or time period
3. **Analyze Publications**: Track publication trends and scholarly output
4. **Generate Insights**: Access pre-built analytics and program metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is part of the University of Michigan African Presidential Scholars (UMAPS) program.

## 📞 Support

For questions or support regarding the UMAPS program or this application, please contact the program administrators.

## 🔍 Troubleshooting

### Common Issues

1. **Database not found**: Run `python build_db.py` to create the database
2. **Missing data files**: Ensure all Excel files are in the `data/` directory
3. **Import errors**: Make sure all dependencies are installed via `pip install -r requirements.txt`

### Performance Tips

- For large datasets, consider increasing your system's available memory
- The application uses caching to improve performance after initial data loading
